import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueMessage } from '@/lib/queue'
import { MessageJobData } from '@/types'

// UazAPI real payload format (flat structure — NOT Baileys format)
interface UazAPIMessage {
  // Identification
  id?: string          // internal UazAPI ID (e.g. "r8a8abef76b3dc3")
  messageid?: string   // original WhatsApp message ID
  chatid?: string      // conversation JID (e.g. "5511...@s.whatsapp.net" or "...@g.us")
  sender?: string      // sender JID
  senderName?: string  // display name (pushName)

  // Flags
  isGroup?: boolean
  fromMe?: boolean

  // Content
  messageType?: string // "conversation", "imageMessage", "audioMessage", etc.
  text?: string        // the text content (all types resolved by UazAPI)
  source?: string

  // Media (when messageType != conversation)
  mediaUrl?: string
  mediaMimetype?: string

  // Timing
  messageTimestamp?: number

  // Connection event fields
  status?: string      // "connected", "disconnected", "open", "close"
  connection?: string  // alternative field for connection state
}

// Message types to ignore
const IGNORED_MESSAGE_TYPES = new Set([
  'protocolMessage',
  'ephemeralMessage',
  'reactionMessage',
  'pollUpdateMessage',
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')

  const admin = createAdminClient()

  // Fetch agent + validate secret
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

  // Check user quota
  const userProfile = (agent.user as any)
  if (userProfile && !userProfile.is_active) {
    return NextResponse.json({ ok: true, reason: 'user_inactive' })
  }
  const maxMessages = userProfile?.plan?.max_messages_month ?? Infinity
  if (userProfile?.messages_used_month >= maxMessages) {
    return NextResponse.json({ ok: true, reason: 'quota_exceeded' })
  }

  // Parse body — UazAPI sends flat objects, NOT { event, data: {...} }
  const body: UazAPIMessage = await req.json()
  console.log(`[webhook] Agent ${agentId} — messageType: ${body.messageType}, fromMe: ${body.fromMe}, chatid: ${body.chatid}, status: ${body.status}`)

  // === CONNECTION EVENT ===
  // Connection payloads have status/connection but no chatid
  if (body.status || body.connection) {
    const state = body.status || body.connection
    console.log(`[webhook] Connection event: ${state}`)
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
  const chatId = body.chatid || ''
  const fromMe = body.fromMe ?? false
  const messageType = body.messageType || ''
  const text = body.text || ''

  if (!chatId || !messageType) {
    console.log(`[webhook] Skipping — no chatid or messageType`)
    return NextResponse.json({ ok: true })
  }
  if (IGNORED_MESSAGE_TYPES.has(messageType)) return NextResponse.json({ ok: true })

  const isGroup = chatId.endsWith('@g.us')

  // fromMe = true → agent owner sent manually
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
    .eq('agent_id', agentId)
    .eq('phone', phone)
    .maybeSingle()

  if (customer?.is_blocked) return NextResponse.json({ ok: true, reason: 'blocked' })

  if (customer?.chatbot_disabled_until) {
    const disabledUntil = new Date(customer.chatbot_disabled_until)
    if (disabledUntil > new Date()) {
      return NextResponse.json({ ok: true, reason: 'human_takeover' })
    }
  }

  // Build job data using UazAPI flat fields
  const jobData: MessageJobData = {
    agentId,
    userId: agent.user_id,
    chatId,
    phone,
    pushName: body.senderName || null,
    isGroup,
    groupJid: isGroup ? chatId : null,
    messageId: body.messageid || body.id || '',
    messageType,
    content: text || null,
    mediaUrl: body.mediaUrl || null,
    mediaMimeType: body.mediaMimetype || null,
    receivedAt: body.messageTimestamp || Date.now(),
  }

  const debounceMs = (agent.message_debounce_seconds || 3) * 1000
  const jobId = `msg-${agentId}-${phone}-${Date.now()}`

  try {
    await enqueueMessage(jobId, jobData, debounceMs)
    console.log(`[webhook] ✅ Enqueued job ${jobId} — agent ${agentId}, phone ${phone}, text: "${text.substring(0, 50)}"`)
  } catch (err: any) {
    console.error(`[webhook] ❌ Failed to enqueue:`, err?.message)
    return NextResponse.json({ ok: false, reason: 'queue_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
