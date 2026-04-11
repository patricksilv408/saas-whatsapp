import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueMessage } from '@/lib/queue'
import { MessageJobData } from '@/types'

// UazAPI WebhookEvent schema (from openapi spec):
// { event: "message"|"connection"|"status"|"presence"|"group", instance: string, data: object }
//
// data for event="message" → Message schema:
//   chatid, sender, senderName, fromMe, isGroup, messageType, text,
//   messageid, id, messageTimestamp, content, wasSentByApi, ...
//
// data for event="connection" → { status: "connected"|"disconnected"|"open"|"close", ... }

interface UazAPIWebhookBody {
  event?: string      // "message" | "connection" | "status" | "presence" | "group"
  instance?: string
  data?: {
    // Message fields
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
    // Connection fields
    status?: string
    connection?: string
    state?: string
  }
}

const IGNORED_MESSAGE_TYPES = new Set([
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

  // Parse body — log raw text to debug actual UazAPI payload format
  const rawText = await req.text()
  console.log(`[webhook] RAW BODY (${rawText.length}b):`, rawText.substring(0, 1000))

  let parsed: any
  try { parsed = JSON.parse(rawText) } catch (e) {
    console.error(`[webhook] JSON parse failed:`, e)
    return NextResponse.json({ ok: true })
  }

  console.log(`[webhook] isArray: ${Array.isArray(parsed)}, keys: ${Object.keys(parsed || {}).join(', ')}`)

  const body: UazAPIWebhookBody = Array.isArray(parsed) ? (parsed[0] || {}) : parsed
  const event = body.event
  const data = body.data || {}

  console.log(`[webhook] event: "${event}", data keys: ${Object.keys(data).join(', ')}`)

  // === CONNECTION EVENT ===
  if (event === 'connection') {
    const state = data.status || data.connection || data.state
    console.log(`[webhook] Connection state: ${state}`)
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
  if (event !== 'message') return NextResponse.json({ ok: true })

  const chatId = data.chatid || ''
  const fromMe = data.fromMe ?? false
  const messageType = data.messageType || ''
  const text = data.text || ''
  const isGroup = data.isGroup ?? chatId.endsWith('@g.us')

  if (!chatId || !messageType) {
    console.log(`[webhook] Skipping — no chatid or messageType`)
    return NextResponse.json({ ok: true })
  }
  if (IGNORED_MESSAGE_TYPES.has(messageType)) return NextResponse.json({ ok: true })

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
  if (data.content && typeof data.content === 'object') {
    const c = data.content as any
    mediaUrl = c.url || c.mediaUrl || null
    mediaMimeType = c.mimetype || c.mimeType || null
  }

  const jobData: MessageJobData = {
    agentId,
    userId: agent.user_id,
    chatId,
    phone,
    pushName: data.senderName || null,
    isGroup,
    groupJid: isGroup ? chatId : null,
    messageId: data.messageid || data.id || '',
    messageType,
    content: text || null,
    mediaUrl,
    mediaMimeType,
    receivedAt: data.messageTimestamp || Date.now(),
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
