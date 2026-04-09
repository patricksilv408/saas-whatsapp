import OpenAI from 'openai'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey })

  // Write to temp file
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'mp3'
  const tmpFile = join(tmpdir(), `audio-${Date.now()}.${ext}`)

  try {
    const buffer = Buffer.from(base64Audio, 'base64')
    writeFileSync(tmpFile, buffer)

    const { createReadStream } = await import('fs')
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tmpFile) as any,
      model: 'whisper-1',
      language: 'pt',
    })

    return transcription.text
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}
