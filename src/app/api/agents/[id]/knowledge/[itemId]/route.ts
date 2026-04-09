import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  // Verify ownership via agent
  const { data: item } = await admin
    .from('knowledge_items')
    .select('agent_id, agents!inner(user_id)')
    .eq('id', itemId)
    .eq('agent_id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin.from('knowledge_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
