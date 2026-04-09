import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const agentId = formData.get('agentId') as string | null

  if (!file || !agentId) {
    return NextResponse.json({ error: 'file and agentId are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify agent belongs to user
  const { data: agent } = await admin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  let content = ''
  const fileType = file.name.endsWith('.pdf') ? 'pdf' :
    file.name.endsWith('.csv') ? 'csv' : 'text'

  if (fileType === 'pdf') {
    // Dynamic import to avoid edge runtime issues
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(Buffer.from(bytes))
    content = parsed.text
  } else {
    content = new TextDecoder().decode(bytes)
  }

  // Generate embedding
  const { data: agentData } = await admin
    .from('agents')
    .select('llm_api_key_encrypted')
    .eq('id', agentId)
    .single()

  let embedding = null
  try {
    const embRes = await fetch(`${process.env.APP_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content.substring(0, 8000) }),
    })
    if (embRes.ok) {
      const { embedding: emb } = await embRes.json()
      embedding = emb
    }
  } catch {}

  // Save to storage
  const storagePath = `${agentId}/${Date.now()}-${file.name}`
  await admin.storage.from('knowledge-files').upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  })

  const { data: { publicUrl } } = admin.storage
    .from('knowledge-files')
    .getPublicUrl(storagePath)

  const { data, error } = await admin.from('knowledge_items').insert({
    agent_id: agentId,
    title: file.name,
    content,
    file_url: publicUrl,
    file_type: fileType,
    embedding,
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
