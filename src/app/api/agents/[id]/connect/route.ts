import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUazAPIClient, getUazAPIBaseUrl, getUazAPIAdminToken } from '@/lib/uazapi/client'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: userProfile } = await admin
    .from('users')
    .select('custom_uazapi_url, custom_uazapi_admintoken')
    .eq('id', user.id)
    .single()

  const uazapiUrl = getUazAPIBaseUrl(userProfile as any)
  const adminToken = getUazAPIAdminToken(userProfile as any)
  const uazapi = createUazAPIClient(uazapiUrl, agent.uazapi_token || adminToken, adminToken)

  // Return SSE stream for QR code
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Update status
        await admin.from('agents').update({ connection_status: 'connecting' }).eq('id', id)

        // Trigger connection
        await uazapi.connectInstance().catch(() => {})

        // Poll for QR/status
        let attempts = 0
        const maxAttempts = 30

        const poll = async () => {
          if (attempts >= maxAttempts) {
            send({ type: 'timeout', message: 'Tempo limite atingido. Tente novamente.' })
            await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
            controller.close()
            return
          }

          attempts++
          try {
            const status = await uazapi.getInstanceStatus()
            if (status.state === 'open' || status.state === 'connected') {
              await admin.from('agents').update({ connection_status: 'connected' }).eq('id', id)
              send({ type: 'connected' })
              controller.close()
              return
            }
            if (status.qrcode) {
              send({ type: 'qr', data: status.qrcode })
            } else {
              send({ type: 'waiting', state: status.state })
            }
          } catch {
            send({ type: 'error', message: 'Erro ao verificar status' })
          }

          setTimeout(poll, 5000)
        }

        setTimeout(poll, 2000)
      } catch (err) {
        send({ type: 'error', message: 'Falha ao iniciar conexão' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
