import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getAgentId(req: NextRequest, params: Promise<{ id: string }>) {
  const { id } = await params
  return id
}

async function verifyAccess(agentId: string, userId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('agents').select('id').eq('id', agentId).eq('user_id', userId).single()
  return !!data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentId = await getAgentId(req, params)
  if (!await verifyAccess(agentId, user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('agent_triggers').select('*').eq('agent_id', agentId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentId = await getAgentId(req, params)
  if (!await verifyAccess(agentId, user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { keyword, match_type, action, response, is_active } = body

  if (!keyword?.trim()) return NextResponse.json({ error: 'keyword is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('agent_triggers').insert({
    agent_id: agentId,
    keyword: keyword.trim(),
    match_type: match_type || 'contains',
    action: action || 'message',
    response: response || null,
    is_active: is_active !== false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
