import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, custom_uazapi_url, custom_uazapi_admintoken } = body

  const admin = createAdminClient()
  const { error } = await admin.from('users').update({
    name,
    custom_uazapi_url: custom_uazapi_url || null,
    custom_uazapi_admintoken: custom_uazapi_admintoken || null,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
