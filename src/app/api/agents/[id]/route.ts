import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptKey } from '@/lib/crypto'

async function getAgentForUser(agentId: string, userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agent = await getAgentForUser(id, user.id)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ...agent,
    llm_api_key_encrypted: undefined,
    has_llm_api_key: !!agent.llm_api_key_encrypted,
    elevenlabs_api_key_encrypted: undefined,
    has_elevenlabs_api_key: !!agent.elevenlabs_api_key_encrypted,
    uazapi_token: undefined,
    webhook_secret: undefined,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agent = await getAgentForUser(id, user.id)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  // Fields that need encryption before storing
  const updateData: Record<string, unknown> = {}
  const encryptableFields = ['llm_api_key', 'elevenlabs_api_key']

  // Virtual/read-only fields that must never be written to the DB
  const readOnlyFields = [
    'id', 'user_id', 'created_at', 'updated_at',
    'webhook_secret', 'uazapi_token',
    'has_llm_api_key', 'has_elevenlabs_api_key',
    'llm_api_key_encrypted', 'elevenlabs_api_key_encrypted',
  ]

  for (const [key, value] of Object.entries(body)) {
    if (encryptableFields.includes(key)) {
      // Encrypt API keys
      if (value && typeof value === 'string' && value.trim()) {
        try {
          const encField = `${key}_encrypted`
          updateData[encField] = encryptKey(value as string)
        } catch {
          return NextResponse.json({ error: 'Falha ao criptografar chave de API. Verifique ENCRYPTION_SECRET.' }, { status: 500 })
        }
      }
    } else if (!readOnlyFields.includes(key)) {
      updateData[key] = value
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ...data,
    llm_api_key_encrypted: undefined,
    has_llm_api_key: !!data.llm_api_key_encrypted,
    elevenlabs_api_key_encrypted: undefined,
    has_elevenlabs_api_key: !!data.elevenlabs_api_key_encrypted,
    uazapi_token: undefined,
    webhook_secret: undefined,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const agent = await getAgentForUser(id, user.id)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin.from('agents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
