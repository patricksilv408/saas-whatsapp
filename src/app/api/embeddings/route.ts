import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const { text, apiKey } = await req.json()

  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'No OpenAI API key' }, { status: 500 })

  const openai = new OpenAI({ apiKey: key })
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8000),
  })

  return NextResponse.json({ embedding: res.data[0].embedding })
}
