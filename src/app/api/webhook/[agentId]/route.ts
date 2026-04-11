import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueMessage } from '@/lib/queue'
import { UazAPIWebhookEvent, MessageJobData } from '@/types'

// Message types that should be ignored completely
const IGNORED_MESSAGE_TYPES = new Set([
  'protocolMessage',
  'ephemeralMessage',
  'reactionMessage',
  'pollUpdateMessage',
  'stickerMessage', // handle separately if needed
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

  console.log(`[webhook] Received event for agent ${agentId}`)

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

  // Handle connection events (reconnection logic)
  const body: UazAPIWebhookEvent = await req.json()
  const { event, data } = body
  console.log(`[webhook] Agent ${agentId} — event: "${event}", messageType: ${data?.messageType}, fromMe: ${data?.key?.fromMe}`)

  // UazAPI events: "connection", "messages" (addUrlEvents: false)
  if (event === 'connection' || event === 'connection.update') {
    const state = data?.status || (data as any)?.state || (data as any)?.connection
    if (state === 'open' || state === 'connected') {
      await admin.from('agents').update({ connection_status: 'connected' }).eq('id', agentId)
    } else if (state === 'close' || state === 'disconnected') {
      await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', agentId)
      // Create notification for user
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

  // Only process message events (UazAPI sends "messages.upsert" or "messages")
  if (event !== 'messages' && event !== 'messages.upsert') return NextResponse.json({ ok: true })

  const key = data?.key
  const messageType = data?.messageType
  const message = data?.message

  if (!key || !messageType || !message) return NextResponse.json({ ok: true })
  if (IGNORED_MESSAGE_TYPES.has(messageType)) return NextResponse.json({ ok: true })

  const chatId = key.remoteJid || ''
  const fromMe = key.fromMe ?? false
  const isGroup = chatId.endsWith('@g.us')

  // Handoff human detection (fromMe = true means agent owner sent a message)
  if (fromMe) {
    const sentText =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      ''

    if (sentText.trim().toLowerCase() === agent.human_resume_command?.toLowerCase()) {
      // Resume bot
      const phone = isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')
      await admin
        .from('customers')
        .update({ chatbot_disabled_until: null, human_attendant_id: null })
        .eq('agent_id', agentId)
        .eq('phone', phone)
    } else if (agent.human_takeover_enabled) {
      // Pause bot
      const phone = isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')
      const disableUntil = new Date(Date.now() + (agent.chatbot_stop_minutes || 60) * 60 * 1000)
      await admin
        .from('customers')
        .update({
          chatbot_disabled_until: disableUntil.toISOString(),
          human_attendant_id: agent.user_id,
        })
        .eq('agent_id', agentId)
        .eq('phone', phone)
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

  // Check blacklist
  const { data: customer } = await admin
    .from('customers')
    .select('id, is_blocked, chatbot_disabled_until')
    .eq('agent_id', agentId)
    .eq('phone', phone)
    .maybeSingle()

  if (customer?.is_blocked) return NextResponse.json({ ok: true, reason: 'blocked' })

  // Check human takeover still active
  if (customer?.chatbot_disabled_until) {
    const disabledUntil = new Date(customer.chatbot_disabled_until)
    if (disabledUntil > new Date()) {
      // Bot is paused — still save the message but don't process with AI
      await saveInboundMessage(agentId, customer.id, messageType, message, key.id)
      return NextResponse.json({ ok: true, reason: 'human_takeover' })
    }
  }

  // Extract content
  const textContent =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    null

  const mediaUrl = (message as any)?.imageMessage?.url ||
    (message as any)?.audioMessage?.url ||
    (message as any)?.videoMessage?.url ||
    (message as any)?.documentMessage?.url ||
    null

  const mediaMimeType = (message as any)?.imageMessage?.mimetype ||
    (message as any)?.audioMessage?.mimetype ||
    (message as any)?.videoMessage?.mimetype ||
    (message as any)?.documentMessage?.mimetype ||
    null

  // Build job data
  const jobData: MessageJobData = {
    agentId,
    userId: agent.user_id,
    chatId,
    phone,
    pushName: data?.pushName || null,
    isGroup,
    groupJid: isGroup ? chatId : null,
    messageId: key.id,
    messageType,
    content: textContent,
    mediaUrl,
    mediaMimeType,
    receivedAt: data?.messageTimestamp || Date.now(),
  }

  // Debounce: use chatId as job ID so duplicate messages replace each other
  const debounceMs = (agent.message_debounce_seconds || 3) * 1000
  const jobId = `msg-${agentId}-${phone}-${Date.now()}`

  try {
    await enqueueMessage(jobId, jobData, debounceMs)
    console.log(`[webhook] Enqueued job ${jobId} for agent ${agentId}, phone ${phone}`)
  } catch (err: any) {
    console.error(`[webhook] Failed to enqueue message:`, err?.message)
    return NextResponse.json({ ok: false, reason: 'queue_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function saveInboundMessage(
  agentId: string,
  customerId: string,
  messageType: string,
  message: any,
  messageId: string
) {
  const admin = createAdminClient()
  await admin.from('messages').insert({
    agent_id: agentId,
    customer_id: customerId,
    direction: 'inbound',
    content_type: messageType.includes('audio') ? 'audio' :
      messageType.includes('image') ? 'image' :
      messageType.includes('video') ? 'video' :
      messageType.includes('document') ? 'document' :
      messageType.includes('location') ? 'location' : 'text',
    content: message?.conversation || message?.extendedTextMessage?.text || null,
    uazapi_message_id: messageId,
  })
}
