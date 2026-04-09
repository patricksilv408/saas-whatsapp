import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUazAPIClient, getUazAPIBaseUrl, getUazAPIAdminToken } from '@/lib/uazapi/client'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('uazapi_token, connection_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!agent.uazapi_token) {
    return NextResponse.json({ state: 'not_configured', connection_status: 'disconnected' })
  }

  const { data: userProfile } = await admin
    .from('users')
    .select('custom_uazapi_url')
    .eq('id', user.id)
    .single()

  try {
    const uazapi = createUazAPIClient(
      getUazAPIBaseUrl(userProfile as any),
      agent.uazapi_token
    )
    const status = await uazapi.getInstanceStatus()
    return NextResponse.json({ ...status, connection_status: agent.connection_status })
  } catch {
    return NextResponse.json({ state: 'error', connection_status: agent.connection_status })
  }
}
