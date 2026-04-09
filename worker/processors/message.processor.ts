import { createClient } from '@supabase/supabase-js'
import { UazAPIService } from '../services/uazapi.service'
import { LLMService, LLMMessage, LLMTool } from '../services/llm.service'
import { transcribeAudio } from '../services/stt.service'
import { synthesizeSpeech } from '../services/tts.service'
import { evaluate } from 'mathjs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET!

// Import crypto from node (worker runs as Node.js)
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function decryptKey(ciphertext: string): string {
  const key = createHash('sha256').update(ENCRYPTION_SECRET).digest()
  const buf = Buffer.from(ciphertext, 'hex')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface JobData {
  agentId: string
  userId: string
  chatId: string
  phone: string
  pushName: string | null
  isGroup: boolean
  groupJid: string | null
  messageId: string
  messageType: string
  content: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  receivedAt: number
}

export async function processMessage(data: JobData): Promise<void> {
  const sb = getSupabase()

  // --- Load agent ---
  const { data: agent } = await sb
    .from('agents')
    .select('*')
    .eq('id', data.agentId)
    .single()

  if (!agent || !agent.is_active) return

  // --- Decrypt API key ---
  const llmApiKey = agent.llm_api_key_encrypted
    ? decryptKey(agent.llm_api_key_encrypted)
    : process.env.OPENAI_API_KEY || ''

  if (!llmApiKey) {
    console.warn(`Agent ${data.agentId}: no LLM API key configured`)
    return
  }

  const elevenlabsKey = agent.elevenlabs_api_key_encrypted
    ? decryptKey(agent.elevenlabs_api_key_encrypted)
    : process.env.ELEVENLABS_API_KEY || ''

  // --- UazAPI client ---
  const uazBaseUrl = process.env.UAZAPI_DEFAULT_URL || 'https://free.uazapi.com'
  const uazapi = new UazAPIService(uazBaseUrl, agent.uazapi_token || '')

  // === STEP 1: Resolve media content ===
  let resolvedText = data.content || ''
  let imageBase64: string | null = null
  let receivedAudio = false

  if (data.messageType === 'audioMessage' && agent.transcribe_audio) {
    try {
      const media = await uazapi.downloadMedia(data.messageId, data.chatId)
      resolvedText = await transcribeAudio(media.base64, media.mimetype, llmApiKey)
      receivedAudio = true
    } catch (e) {
      console.error('Audio transcription failed:', e)
      resolvedText = '[Áudio não transcrito]'
    }
  } else if (data.messageType === 'imageMessage' && agent.read_images) {
    try {
      const media = await uazapi.downloadMedia(data.messageId, data.chatId)
      imageBase64 = media.base64
    } catch (e) {
      console.error('Image download failed:', e)
    }
  } else if (data.messageType === 'documentMessage' && agent.read_documents && data.mediaUrl) {
    try {
      const res = await fetch(data.mediaUrl)
      const buffer = await res.arrayBuffer()
      if (data.mediaMimeType?.includes('pdf')) {
        const parsed = await pdfParse(Buffer.from(buffer))
        resolvedText = parsed.text
      }
    } catch (e) {
      console.error('Document processing failed:', e)
    }
  }

  if (!resolvedText && !imageBase64) return

  // === STEP 2: Presence indicators ===
  if (agent.send_read_receipt) {
    uazapi.markAsRead(data.chatId).catch(() => {})
  }
  if (agent.send_typing_indicator) {
    uazapi.sendPresence(data.chatId, 'composing').catch(() => {})
  }

  // === STEP 3: Find or create customer ===
  let { data: customer } = await sb
    .from('customers')
    .select('*')
    .eq('agent_id', data.agentId)
    .eq('phone', data.phone)
    .maybeSingle()

  if (!customer) {
    const { data: newCustomer } = await sb
      .from('customers')
      .insert({
        agent_id: data.agentId,
        phone: data.phone,
        name: data.pushName,
      })
      .select()
      .single()
    customer = newCustomer

    if (agent.auto_add_contacts && data.pushName) {
      uazapi.addContact(data.phone, data.pushName).catch(() => {})
    }
  }

  if (!customer) {
    console.error(`Failed to find/create customer for phone ${data.phone}`)
    return
  }

  // === STEP 4: Load memory ===
  const { data: memoryTurns } = await sb
    .from('memory_turns')
    .select('role, content')
    .eq('agent_id', data.agentId)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(agent.short_term_memory_turns || 10)

  const history: LLMMessage[] = (memoryTurns || [])
    .reverse()
    .map((t: any) => ({ role: t.role, content: t.content }))

  // === STEP 5: Build system prompt ===
  const now = new Date()
  const systemPrompt = (agent.system_prompt || 'Você é um assistente útil.')
    .replace('{{customer_name}}', customer.name || data.pushName || 'cliente')
    .replace('{{customer_phone}}', data.phone)
    .replace('{{customer_data}}', JSON.stringify(customer.custom_fields || {}))
    .replace('{{current_date}}', now.toLocaleDateString('pt-BR'))
    .replace('{{current_time}}', now.toLocaleTimeString('pt-BR'))

  let fullSystemPrompt = systemPrompt
  if (agent.long_term_memory_enabled && customer.long_term_memory) {
    fullSystemPrompt += `\n\n## Histórico do cliente:\n${customer.long_term_memory}`
  }

  // === STEP 6: RAG - Knowledge Base ===
  let knowledgeContext = ''
  if (llmApiKey && resolvedText) {
    try {
      // Generate embedding for the query
      const embeddingRes = await fetch(`${process.env.APP_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: resolvedText, apiKey: llmApiKey }),
      })
      if (embeddingRes.ok) {
        const { embedding } = await embeddingRes.json()
        if (embedding) {
          const { data: kbResults } = await sb.rpc('search_knowledge', {
            p_agent_id: data.agentId,
            p_embedding: embedding,
            p_match_count: 5,
          })
          if (kbResults?.length) {
            knowledgeContext = '\n\n## Base de conhecimento relevante:\n' +
              kbResults.map((r: any) => `### ${r.title}\n${r.content}`).join('\n\n')
          }

          // Product search
          const { data: productResults } = await sb.rpc('search_products', {
            p_agent_id: data.agentId,
            p_embedding: embedding,
            p_match_count: 5,
          })
          if (productResults?.length) {
            knowledgeContext += '\n\n## Produtos relevantes:\n' +
              productResults.map((p: any) =>
                `- ${p.name}: ${p.description || ''} R$ ${p.price || 'consultar'}`
              ).join('\n')
          }
        }
      }
    } catch (e) {
      console.warn('RAG search failed:', e)
    }
  }

  if (knowledgeContext) {
    fullSystemPrompt += knowledgeContext
  }

  // === STEP 7: Load custom agent functions as tools ===
  const { data: agentFunctions } = await sb
    .from('agent_functions')
    .select('*')
    .eq('agent_id', data.agentId)
    .eq('is_active', true)

  const tools: LLMTool[] = [
    {
      name: 'calculator',
      description: 'Realiza cálculos matemáticos. Use para qualquer operação matemática.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Expressão matemática' },
        },
        required: ['expression'],
      },
    },
    ...(agentFunctions || []).map((fn: any) => ({
      name: fn.name,
      description: fn.description || fn.name,
      parameters: fn.parameters_schema || { type: 'object', properties: {} },
    })),
  ]

  // === STEP 8: Build messages and call LLM ===
  const userContent: LLMMessage['content'] = imageBase64
    ? [
        { type: 'text' as const, text: resolvedText || 'O que você vê nessa imagem?' },
        { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ]
    : resolvedText

  const messages: LLMMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ]

  const llm = new LLMService(
    agent.llm_provider,
    agent.llm_model,
    llmApiKey,
    agent.llm_temperature,
    agent.llm_max_tokens
  )

  let totalTokens = 0
  let finalResponse = ''

  // Tool call loop
  const MAX_TOOL_ITERATIONS = 5
  let iteration = 0

  while (iteration < MAX_TOOL_ITERATIONS) {
    const response = await llm.chat(messages, tools)
    totalTokens += response.tokensUsed
    iteration++

    if (!response.toolCalls?.length) {
      finalResponse = response.text
      break
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: response.text || '' })

    for (const tc of response.toolCalls) {
      let toolResult = ''

      if (tc.name === 'calculator') {
        try {
          const result = evaluate((tc.args as any).expression)
          toolResult = String(result)
        } catch {
          toolResult = 'Erro: expressão inválida'
        }
      } else {
        // Custom HTTP function
        const fn = agentFunctions?.find((f: any) => f.name === tc.name)
        if (fn) {
          try {
            const res = await fetch(fn.http_url, {
              method: fn.http_method || 'POST',
              headers: { 'Content-Type': 'application/json', ...((fn.http_headers as object) || {}) },
              body: ['GET', 'HEAD'].includes(fn.http_method) ? undefined : JSON.stringify(tc.args),
            })
            const resData = await res.json()
            toolResult = JSON.stringify(resData)
          } catch (e: any) {
            toolResult = `Erro: ${e.message}`
          }
        }
      }

      messages.push({ role: 'user', content: `Tool ${tc.name} result: ${toolResult}` })
    }
  }

  if (!finalResponse) {
    console.error('LLM did not produce a final response')
    return
  }

  // Stop typing indicator
  uazapi.sendPresence(data.chatId, 'paused').catch(() => {})

  // === STEP 9: Send response ===
  const responseChunks = agent.split_messages
    ? finalResponse.split(/\n\n+/).filter((c) => c.trim())
    : [finalResponse]

  for (const chunk of responseChunks) {
    if (agent.send_audio_response && receivedAudio && elevenlabsKey && agent.elevenlabs_voice_id) {
      try {
        const audioBuffer = await synthesizeSpeech(chunk, agent.elevenlabs_voice_id, elevenlabsKey)
        // Upload to Supabase Storage and send as PTT
        const fileName = `tts-${Date.now()}.mp3`
        const { data: uploaded } = await getSupabase().storage
          .from('agent-media')
          .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

        if (uploaded) {
          const { data: { publicUrl } } = getSupabase().storage
            .from('agent-media')
            .getPublicUrl(fileName)
          await uazapi.sendMedia(data.chatId, publicUrl, 'ptt')
        } else {
          await uazapi.sendText(data.chatId, chunk)
        }
      } catch (e) {
        console.error('TTS failed, sending text:', e)
        await uazapi.sendText(data.chatId, chunk)
      }
    } else {
      await uazapi.sendText(data.chatId, chunk)
      if (responseChunks.length > 1) {
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }

  // === STEP 10: Post-processing (save to DB, update memory) ===
  const inboundMsg = await sb.from('messages').insert({
    agent_id: data.agentId,
    customer_id: customer.id,
    direction: 'inbound',
    content_type: data.messageType.includes('audio') ? 'audio' :
      data.messageType.includes('image') ? 'image' :
      data.messageType.includes('video') ? 'video' :
      data.messageType.includes('document') ? 'document' :
      data.messageType.includes('location') ? 'location' : 'text',
    content: resolvedText || data.content,
    uazapi_message_id: data.messageId,
  }).select('id').single()

  await sb.from('messages').insert({
    agent_id: data.agentId,
    customer_id: customer.id,
    direction: 'outbound',
    content_type: 'text',
    content: finalResponse,
    llm_tokens_used: totalTokens,
  })

  // Update memory turns
  await sb.from('memory_turns').insert([
    { agent_id: data.agentId, customer_id: customer.id, role: 'user', content: resolvedText || data.content || '' },
    { agent_id: data.agentId, customer_id: customer.id, role: 'assistant', content: finalResponse },
  ])

  // Trim memory to limit
  const limit = agent.short_term_memory_turns || 10
  const { data: oldTurns } = await sb
    .from('memory_turns')
    .select('id')
    .eq('agent_id', data.agentId)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .range(limit * 2, 9999)

  if (oldTurns?.length) {
    await sb.from('memory_turns').delete().in('id', oldTurns.map((t: any) => t.id))
  }

  // Update customer stats
  await sb.from('customers').update({
    last_interaction_at: new Date().toISOString(),
    total_interactions: (customer.total_interactions || 0) + 1,
    name: customer.name || data.pushName,
  }).eq('id', customer.id)

  // Update agent + user token counts
  await sb.from('agents').update({
    total_messages: (agent.total_messages || 0) + 1,
    total_tokens_used: (agent.total_tokens_used || 0) + totalTokens,
  }).eq('id', data.agentId)

  await sb.from('users').update({
    messages_used_month: sb.rpc as any,
  }).eq('id', data.userId)

  // Simple increment (workaround for RPC limitation)
  await getSupabase()
    .from('users')
    .update({ messages_used_month: data.userId })
    .eq('id', data.userId)

  // Usage log
  await sb.from('usage_logs').insert({
    user_id: data.userId,
    agent_id: data.agentId,
    action_type: 'message_processed',
    tokens_used: totalTokens,
  })

  // Long-term memory compression
  if (agent.long_term_memory_enabled) {
    const { count } = await sb
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('agent_id', data.agentId)
      .eq('customer_id', customer.id)

    const compressEvery = agent.long_term_memory_compress_every || 20
    if (count && count % compressEvery === 0) {
      const { data: recentMsgs } = await sb
        .from('messages')
        .select('direction, content')
        .eq('agent_id', data.agentId)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(compressEvery)

      if (recentMsgs?.length) {
        const conversationText = recentMsgs
          .reverse()
          .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.content || ''}`)
          .join('\n')

        const summaryLlm = new LLMService(agent.llm_provider, agent.llm_model, llmApiKey)
        const summaryResponse = await summaryLlm.chat([
          {
            role: 'system',
            content: 'Você é um assistente. Crie um resumo conciso do histórico de conversa a seguir para uso como memória de longo prazo. Inclua informações importantes sobre o cliente.',
          },
          { role: 'user', content: conversationText },
        ])

        await sb.from('customers').update({
          long_term_memory: summaryResponse.text,
        }).eq('id', customer.id)
      }
    }
  }
}
