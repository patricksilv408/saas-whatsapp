import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUazAPIClient, getUazAPIBaseUrl } from '@/lib/uazapi/client'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('uazapi_token')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent?.uazapi_token) {
    return NextResponse.json({ error: 'Agent not connected' }, { status: 400 })
  }

  const { data: userProfile } = await admin
    .from('users')
    .select('custom_uazapi_url')
    .eq('id', user.id)
    .single()

  const body = await req.json()
  const { customerPhone, text, customerId } = body

  if (!customerPhone || !text) {
    return NextResponse.json({ error: 'customerPhone and text are required' }, { status: 400 })
  }

  const uazapi = createUazAPIClient(getUazAPIBaseUrl(userProfile as any), agent.uazapi_token)

  try {
    await uazapi.sendText(customerPhone, text)

    // Save message to DB
    if (customerId) {
      await admin.from('messages').insert({
        agent_id: id,
        customer_id: customerId,
        direction: 'outbound',
        content_type: 'text',
        content: text,
        is_from_human_attendant: true,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
