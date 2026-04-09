import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUazAPIClient, getUazAPIBaseUrl, getUazAPIAdminToken } from '@/lib/uazapi/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: agents, error } = await admin
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Strip encrypted keys from response
  const safeAgents = agents?.map((a) => ({
    ...a,
    llm_api_key_encrypted: undefined,
    has_llm_api_key: !!a.llm_api_key_encrypted,
    elevenlabs_api_key_encrypted: undefined,
    has_elevenlabs_api_key: !!a.elevenlabs_api_key_encrypted,
    uazapi_token: undefined,
    webhook_secret: undefined,
  }))

  return NextResponse.json(safeAgents)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Check plan quota
  const { data: userProfile } = await admin
    .from('users')
    .select('*, plan:plans(*)')
    .eq('id', user.id)
    .single()

  const { count: agentCount } = await admin
    .from('agents')
    .select('id', { count: 'exact' })
    .eq('user_id', user.id)

  const maxAgents = (userProfile as any)?.plan?.max_agents ?? 1
  if ((agentCount ?? 0) >= maxAgents) {
    return NextResponse.json(
      { error: `Limite de ${maxAgents} agentes atingido para o seu plano` },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { name, description } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome do agente é obrigatório' }, { status: 400 })
  }

  // Create agent record first (get ID for instance name)
  const { data: agent, error: createError } = await admin
    .from('agents')
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single()

  if (createError || !agent) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create agent' }, { status: 500 })
  }

  // Initialize UazAPI instance
  try {
    const uazapiUrl = getUazAPIBaseUrl(userProfile as any)
    const adminToken = getUazAPIAdminToken(userProfile as any)

    if (adminToken) {
      const instanceId = `agent-${agent.id.replace(/-/g, '').substring(0, 16)}`
      const uazapi = createUazAPIClient(uazapiUrl, adminToken, adminToken)

      const initResult = await uazapi.initInstance(instanceId) as any
      const instanceToken = initResult?.token || initResult?.instance?.token

      // Register webhook
      const webhookUrl = `${process.env.APP_URL}/api/webhook/${agent.id}?secret=${agent.webhook_secret}`
      if (instanceToken) {
        const instanceClient = createUazAPIClient(uazapiUrl, instanceToken, adminToken)
        await instanceClient.registerWebhook(webhookUrl, ['messages', 'connection', 'send', 'presence'])
        await instanceClient.updateChatbotSettings({
          chatbot_enabled: true,
          chatbot_ignoreGroups: true,
          chatbot_stopWhenYouSendMsg: true,
          chatbot_stopMinutes: 60,
        })
      }

      await admin
        .from('agents')
        .update({
          uazapi_instance_id: instanceId,
          uazapi_token: instanceToken || null,
        })
        .eq('id', agent.id)
    }
  } catch (err) {
    // UazAPI init is non-critical — agent is created, just not connected yet
    console.error('UazAPI init failed:', err)
  }

  return NextResponse.json({ id: agent.id, name: agent.name }, { status: 201 })
}
