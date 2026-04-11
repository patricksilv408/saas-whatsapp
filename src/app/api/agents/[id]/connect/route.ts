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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        await admin.from('agents').update({ connection_status: 'connecting' }).eq('id', id)

        let instanceToken = agent.uazapi_token as string | null

        // Step 1: create instance if it doesn't exist yet
        if (!instanceToken) {
          const adminClient = createUazAPIClient(uazapiUrl, adminToken, adminToken)
          let initResult: any
          try {
            initResult = await adminClient.initInstance(id)
          } catch (err: any) {
            send({ type: 'error', message: `Falha ao criar instância: ${err.message}` })
            await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
            controller.close()
            return
          }

          // UazAPI returns { token, instanceName, ... }
          instanceToken = initResult?.token || initResult?.Token || null
          if (!instanceToken) {
            send({ type: 'error', message: 'UazAPI não retornou token da instância' })
            await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
            controller.close()
            return
          }

          await admin.from('agents').update({
            uazapi_token: instanceToken,
            uazapi_instance_id: id,
          }).eq('id', id)
        }

        // Step 2: connect instance (trigger QR generation)
        const uazapi = createUazAPIClient(uazapiUrl, instanceToken, adminToken)
        await uazapi.connectInstance().catch(() => {})

        // Step 3: register webhook
        const appUrl = process.env.APP_URL || ''
        if (appUrl) {
          await uazapi.registerWebhook(`${appUrl}/api/webhook/${id}`, [
            'messages.upsert', 'connection.update', 'qrcode.updated',
          ]).catch(() => {})
        }

        // Step 4: poll for QR / connected status
        let attempts = 0
        const maxAttempts = 40
        let errorCount = 0

        const poll = async () => {
          if (attempts >= maxAttempts) {
            send({ type: 'timeout', message: 'Tempo limite atingido. Tente novamente.' })
            await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
            controller.close()
            return
          }

          attempts++
          try {
            const result = await uazapi.getInstanceStatus()
            errorCount = 0

            if (result.status?.connected || result.status?.loggedIn) {
              await admin.from('agents').update({ connection_status: 'connected' }).eq('id', id)
              send({ type: 'connected' })
              controller.close()
              return
            }
            const qrRaw = result.instance?.qrcode || ''
            if (qrRaw) {
              // strip data:image/...;base64, prefix if present
              const qrBase64 = qrRaw.includes(',') ? qrRaw.split(',')[1] : qrRaw
              send({ type: 'qr', data: qrBase64 })
            } else {
              send({ type: 'waiting', state: result.instance?.status })
            }
          } catch (err: any) {
            errorCount++
            if (errorCount >= 5) {
              send({ type: 'error', message: 'Erro persistente ao verificar status' })
              await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
              controller.close()
              return
            }
          }

          setTimeout(poll, 5000)
        }

        setTimeout(poll, 2000)
      } catch (err: any) {
        send({ type: 'error', message: `Falha ao iniciar conexão: ${err.message}` })
        await admin.from('agents').update({ connection_status: 'disconnected' }).eq('id', id)
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
