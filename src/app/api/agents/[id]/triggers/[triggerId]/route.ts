import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId, triggerId } = await params
  const admin = createAdminClient()

  const { data: agent } = await admin.from('agents').select('id').eq('id', agentId).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin.from('agent_triggers').delete().eq('id', triggerId).eq('agent_id', agentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId, triggerId } = await params
  const admin = createAdminClient()

  const { data: agent } = await admin.from('agents').select('id').eq('id', agentId).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await admin.from('agent_triggers').update(body).eq('id', triggerId).eq('agent_id', agentId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
