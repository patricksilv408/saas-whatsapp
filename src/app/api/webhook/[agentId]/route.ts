import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueMessage } from '@/lib/queue'
import { MessageJobData } from '@/types'

// UazAPI Webhook payload (confirmed via N8N workflow test data):
// {
//   EventType?: "messages" | "connection" | ...
//   message?: {
//     chatid, sender, senderName, fromMe, isGroup, messageType, text,
//     messageid, id, messageTimestamp, content, wasSentByApi, mediaType, ...
//   }
//   chat?: { wa_chatid, wa_isGroup, wa_label, wa_name, wa_lastMessageType, ... }
//   owner?: string
//   token?: string
//   instanceName?: string
//   chatSource?: string
//   // Legacy/alternate format (WebhookEvent schema):
//   event?: string  // "message" | "connection"
//   instance?: string
//   data?: object
// }

interface UazAPIMessage {
  id?: string
  messageid?: string
  chatid?: string
  sender?: string
  senderName?: string
  isGroup?: boolean
  fromMe?: boolean
  messageType?: string
  text?: string
  messageTimestamp?: number
  wasSentByApi?: boolean
  content?: any
  mediaType?: string
  groupName?: string
}

interface UazAPIChat {
  wa_chatid?: string
  wa_isGroup?: boolean
  wa_label?: string | string[]
  wa_name?: string
  wa_lastMessageType?: string
}

interface UazAPIWebhookBody {
  // Primary format (confirmed from N8N workflow production test data)
  EventType?: string
  message?: UazAPIMessage
  chat?: UazAPIChat
  owner?: string
  token?: string
  instanceName?: string
  chatSource?: string
  // Legacy WebhookEvent schema format (fallback)
  event?: string
  instance?: string
  data?: any
}

// UazAPI sends messageType in PascalCase: TextMessage, AudioMessage, ImageMessage, etc.
const IGNORED_MESSAGE_TYPES = new Set([
  'ProtocolMessage', 'EphemeralMessage', 'ReactionMessage', 'PollUpdateMessage',
  'StickerSyncRMRMessage', 'RequestPaymentMessage', 'DeclinePaymentRequestMessage',
  'CancelPaymentRequestMessage', 'ViewOnceMessage', 'EncReactionMessage',
  // lowercase fallbacks
  'protocolMessage', 'ephemeralMessage', 'reactionMessage', 'pollUpdateMessage',
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('*, user:users(id, is_active, messages_used_month, plan:plans(max_messages_month))')
    .eq('id', agentId)
    .single()

  if (!agent) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
  if (agent.webhook_secret !== secret) {
    console.warn(`[webhook] Invalid secret for agent ${agentId}`)
    return NextResponse.json({ ok: false, reason: 'invalid_secret' }, { status: 401 })
  }
  if (!agent.is_active) return NextResponse.json({ ok: true, reason: 'agent_inactive' })

  const userProfile = (agent.user as any)
  if (userProfile && !userProfile.is_active) return NextResponse.json({ ok: true, reason: 'user_inactive' })
  const maxMessages = userProfile?.plan?.max_messages_month ?? Infinity
  if (userProfile?.messages_used_month >= maxMessages) return NextResponse.json({ ok: true, reason: 'quota_exceeded' })

  // Parse body
  const rawText = await req.text()
  console.log(`[webhook] RAW BODY (${rawText.length}b):`, rawText.substring(0, 800))

  let parsed: any
  try { parsed = JSON.parse(rawText) } catch (e) {
    console.error(`[webhook] JSON parse failed:`, e)
    return NextResponse.json({ ok: true })
  }

  // UazAPI can send arrays or single objects
  const body: UazAPIWebhookBody = Array.isArray(parsed) ? (parsed[0] || {}) : parsed

  const topKeys = Object.keys(body || {}).join(', ')
  console.log(`[webhook] Top-level keys: ${topKeys}`)

  // === DETECT EVENT TYPE ===
  // UazAPI primary format uses body.message for message events
  // Legacy format uses body.event / body.data
  const hasMessage = !!(body.message && body.message.chatid)
  const eventType = body.EventType || body.event || (hasMessage ? 'messages' : 'unknown')

  console.log(`[webhook] EventType: "${eventType}", hasMessage: ${hasMessage}`)

  // === CONNECTION EVENT ===
  const isConnectionEvent =
    eventType === 'connection' ||
    (body.data && (body.data.status || body.data.connection || body.data.state))

  if (isConnectionEvent) {
    const connData = body.data || body
    const state = connData.status || connData.connection || connData.state
    console.log(`[webhook] Connection state: "${state}"`)
    if (state === 'open' || state === 'connected') {
      await admin.from('agents').update({ connection_status: 'connected' }).eq('id', agentId)
    } else if (state === 'close' || state === 'disconnected') {
      await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', agentId)
      await admin.from('notifications').insert({
        user_id: agent.user_id,
        type: 'agent_disconnected',
        title: `Agente "${agent.name}" desconectado`,
        body: 'O WhatsApp foi desconectado. Acesse o painel para reconectar.',
        agent_id: agentId,
      })
    }
    return NextResponse.json({ ok: true })
  }

  // === MESSAGE EVENT ===
  if (!hasMessage) {
    console.log(`[webhook] Skipping — no message object (keys: ${topKeys})`)
    return NextResponse.json({ ok: true })
  }

  const msg = body.message!
  const chat = body.chat || {}

  const chatId = msg.chatid || ''
  const fromMe = msg.fromMe ?? false
  const messageType = msg.messageType || ''
  const text = msg.text || ''
  const isGroup = msg.isGroup ?? (chat as UazAPIChat).wa_isGroup ?? chatId.endsWith('@g.us')

  console.log(`[webhook] msg — chatId: "${chatId}", fromMe: ${fromMe}, type: "${messageType}", text: "${text.substring(0, 80)}"`)

  if (!chatId || !messageType) {
    console.log(`[webhook] Skipping — no chatid or messageType`)
    return NextResponse.json({ ok: true })
  }
  if (IGNORED_MESSAGE_TYPES.has(messageType)) {
    console.log(`[webhook] Skipping ignored type: ${messageType}`)
    return NextResponse.json({ ok: true })
  }

  // fromMe = agent owner sent manually → human handoff
  if (fromMe) {
    const phone = isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')
    if (text.trim().toLowerCase() === agent.human_resume_command?.toLowerCase()) {
      await admin.from('customers')
        .update({ chatbot_disabled_until: null, human_attendant_id: null })
        .eq('agent_id', agentId).eq('phone', phone)
    } else if (agent.human_takeover_enabled) {
      const disableUntil = new Date(Date.now() + (agent.chatbot_stop_minutes || 60) * 60 * 1000)
      await admin.from('customers')
        .update({ chatbot_disabled_until: disableUntil.toISOString(), human_attendant_id: agent.user_id })
        .eq('agent_id', agentId).eq('phone', phone)
    }
    return NextResponse.json({ ok: true })
  }

  // Group filtering
  if (isGroup) {
    if (agent.group_mode === 'ignore_all') return NextResponse.json({ ok: true })
    if (agent.group_mode === 'selected_groups') {
      const allowed: string[] = agent.allowed_group_jids || []
      if (!allowed.includes(chatId)) return NextResponse.json({ ok: true })
    }
  }

  const phone = isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')

  // Check blacklist / human takeover
  const { data: customer } = await admin
    .from('customers')
    .select('id, is_blocked, chatbot_disabled_until')
    .eq('agent_id', agentId).eq('phone', phone)
    .maybeSingle()

  if (customer?.is_blocked) return NextResponse.json({ ok: true, reason: 'blocked' })
  if (customer?.chatbot_disabled_until && new Date(customer.chatbot_disabled_until) > new Date()) {
    return NextResponse.json({ ok: true, reason: 'human_takeover' })
  }

  // Detect media URL from content object if present
  let mediaUrl: string | null = null
  let mediaMimeType: string | null = null
  if (msg.content && typeof msg.content === 'object') {
    const c = msg.content as any
    mediaUrl = c.url || c.mediaUrl || null
    mediaMimeType = c.mimetype || c.mimeType || null
  }

  const jobData: MessageJobData = {
    agentId,
    userId: agent.user_id,
    chatId,
    phone,
    pushName: msg.senderName || null,
    isGroup,
    groupJid: isGroup ? chatId : null,
    messageId: msg.messageid || msg.id || '',
    messageType,
    content: text || null,
    mediaUrl,
    mediaMimeType,
    receivedAt: msg.messageTimestamp || Date.now(),
  }

  const debounceMs = (agent.message_debounce_seconds || 3) * 1000
  const jobId = `msg-${agentId}-${phone}-${Date.now()}`

  try {
    await enqueueMessage(jobId, jobData, debounceMs)
    console.log(`[webhook] ✅ Enqueued — phone: ${phone}, text: "${text.substring(0, 60)}"`)
  } catch (err: any) {
    console.error(`[webhook] ❌ Queue error:`, err?.message)
    return NextResponse.json({ ok: false, reason: 'queue_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
