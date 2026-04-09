import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; path: string[] }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, path } = await params
  const admin = createAdminClient()

  // Verify agent ownership
  const { data: agent } = await admin
    .from('agents')
    .select('uazapi_token, uazapi_instance_id')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: userProfile } = await admin.from('users').select('custom_uazapi_url').eq('id', user.id).single()

  const baseUrl = userProfile?.custom_uazapi_url || process.env.UAZAPI_DEFAULT_URL || 'https://free.uazapi.com'
  const pathStr = path.join('/')
  const url = new URL(`${baseUrl}/${pathStr}`)

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const headers: Record<string, string> = {
    'apikey': agent.uazapi_token || '',
    'Content-Type': 'application/json',
  }

  let body: string | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const json = await req.json()
      body = JSON.stringify(json)
    } catch {
      body = undefined
    }
  }

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  })

  const data = await upstream.text()
  return new NextResponse(data, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
