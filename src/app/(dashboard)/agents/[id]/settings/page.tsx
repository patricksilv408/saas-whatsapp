'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, QrCode, Wifi, WifiOff, RefreshCw, Save } from 'lucide-react'
import { Agent } from '@/types'

export default function AgentSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [form, setForm] = useState<Partial<Agent>>({})

  useEffect(() => {
    loadAgent()
  }, [id])

  async function loadAgent() {
    const res = await fetch(`/api/agents/${id}`)
    if (res.ok) {
      const data = await res.json()
      setAgent(data)
      setForm(data)
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setAgent(updated)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    setQrCode(null)

    const es = new EventSource(`/api/agents/${id}/connect`)

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'qr') {
        setQrCode(data.data)
      } else if (data.type === 'connected') {
        setConnecting(false)
        setQrCode(null)
        es.close()
        loadAgent()
      } else if (data.type === 'timeout' || data.type === 'error') {
        setConnecting(false)
        setQrCode(null)
        es.close()
      }
    }

    es.onerror = () => {
      setConnecting(false)
      es.close()
    }
  }

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent) return <div className="p-6">Agente não encontrado</div>

  const isConnected = agent.connection_status === 'connected'

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-muted-foreground capitalize">
              {agent.connection_status || 'desconectado'}
            </span>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto">
          <TabsTrigger value="general" className="text-xs">Geral</TabsTrigger>
          <TabsTrigger value="whatsapp" className="text-xs">WhatsApp</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">Grupos</TabsTrigger>
          <TabsTrigger value="messages" className="text-xs">Mensagens</TabsTrigger>
          <TabsTrigger value="media-in" className="text-xs">Mídia In</TabsTrigger>
          <TabsTrigger value="media-out" className="text-xs">Mídia Out</TabsTrigger>
          <TabsTrigger value="handoff" className="text-xs">Handoff</TabsTrigger>
          <TabsTrigger value="escalation" className="text-xs">Escalação</TabsTrigger>
        </TabsList>

        {/* Tab 1: General */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input value={form.name || ''} onChange={(e) => update('name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.description || ''} onChange={(e) => update('description', e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.is_active ?? true}
                  onCheckedChange={(v) => update('is_active', v)}
                />
                <Label>Agente ativo</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: WhatsApp Connection */}
        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conexão WhatsApp</CardTitle>
              <CardDescription>Conecte este agente a um número de WhatsApp</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <Badge variant="default" className="bg-green-600">
                    <Wifi className="mr-1 h-3 w-3" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <WifiOff className="mr-1 h-3 w-3" /> Desconectado
                  </Badge>
                )}
              </div>

              {qrCode && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-muted-foreground">Escaneie o QR Code com o WhatsApp</p>
                  <img
                    src={`data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    className="h-56 w-56 rounded-lg border"
                  />
                  <p className="text-xs text-muted-foreground">O QR code atualiza automaticamente</p>
                </div>
              )}

              {connecting && !qrCode && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Iniciando conexão...</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleConnect}
                  disabled={connecting}
                  variant={isConnected ? 'outline' : 'default'}
                >
                  {connecting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando...</>
                  ) : isConnected ? (
                    <><RefreshCw className="mr-2 h-4 w-4" />Reconectar</>
                  ) : (
                    <><QrCode className="mr-2 h-4 w-4" />Conectar WhatsApp</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Groups */}
        <TabsContent value="groups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comportamento em Grupos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Modo de Grupo</Label>
                <Select value={form.group_mode || 'ignore_all'} onValueChange={(v) => update('group_mode', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore_all">Ignorar todos os grupos</SelectItem>
                    <SelectItem value="all_groups">Responder em todos os grupos</SelectItem>
                    <SelectItem value="selected_groups">Apenas grupos selecionados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.auto_add_contacts ?? false}
                  onCheckedChange={(v) => update('auto_add_contacts', v)}
                />
                <Label>Adicionar novos números automaticamente aos contatos</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Messages */}
        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagens e Presença</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Debounce de mensagens quebradas</Label>
                  <span className="text-sm font-medium">{form.message_debounce_seconds ?? 3}s</span>
                </div>
                <Slider
                  min={1} max={30} step={1}
                  value={[form.message_debounce_seconds ?? 3]}
                  onValueChange={(v) => update('message_debounce_seconds', Array.isArray(v) ? v[0] : v)}
                />
                <p className="text-xs text-muted-foreground">
                  Aguarda este tempo antes de processar, para juntar mensagens sequenciais
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.send_typing_indicator ?? true}
                    onCheckedChange={(v) => update('send_typing_indicator', v)}
                  />
                  <Label>Mostrar &quot;digitando...&quot; durante processamento</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.send_read_receipt ?? true}
                    onCheckedChange={(v) => update('send_read_receipt', v)}
                  />
                  <Label>Marcar mensagem como lida ao receber</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Media Inbound */}
        <TabsContent value="media-in" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mídia Recebida</CardTitle>
              <CardDescription>Configure como o agente lida com diferentes tipos de mídia</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Interpretar imagens</Label>
                  <p className="text-xs text-muted-foreground">Usa visão do LLM para analisar imagens</p>
                </div>
                <Switch checked={form.read_images ?? false} onCheckedChange={(v) => update('read_images', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ler documentos</Label>
                  <p className="text-xs text-muted-foreground">Extrai texto de PDFs e documentos</p>
                </div>
                <Switch checked={form.read_documents ?? false} onCheckedChange={(v) => update('read_documents', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Transcrever áudios</Label>
                  <p className="text-xs text-muted-foreground">Usa Whisper para transcrever áudios recebidos</p>
                </div>
                <Switch checked={form.transcribe_audio ?? true} onCheckedChange={(v) => update('transcribe_audio', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 6: Media Outbound */}
        <TabsContent value="media-out" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mídia Enviada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Responder em áudio (TTS)</Label>
                  <p className="text-xs text-muted-foreground">Quando receber áudio, responde com áudio via ElevenLabs</p>
                </div>
                <Switch checked={form.send_audio_response ?? false} onCheckedChange={(v) => update('send_audio_response', v)} />
              </div>
              {form.send_audio_response && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-2">
                    <Label>ElevenLabs API Key</Label>
                    <Input
                      type="password"
                      placeholder="Sua chave da ElevenLabs"
                      onChange={(e) => update('elevenlabs_api_key', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Voice ID</Label>
                    <Input
                      placeholder="Ex: GnDrTQvdzZ7wqAKfLzVQ"
                      value={form.elevenlabs_voice_id || ''}
                      onChange={(e) => update('elevenlabs_voice_id', e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Quebrar respostas longas em múltiplas mensagens</Label>
                <Switch checked={form.split_messages ?? true} onCheckedChange={(v) => update('split_messages', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Permitir envio de imagens</Label>
                <Switch checked={form.allow_send_image ?? true} onCheckedChange={(v) => update('allow_send_image', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Permitir envio de documentos</Label>
                <Switch checked={form.allow_send_document ?? true} onCheckedChange={(v) => update('allow_send_document', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Permitir envio de vídeos</Label>
                <Switch checked={form.allow_send_video ?? false} onCheckedChange={(v) => update('allow_send_video', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 7: Handoff */}
        <TabsContent value="handoff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Handoff para Humano</CardTitle>
              <CardDescription>
                Quando o atendente humano envia uma mensagem pelo WhatsApp conectado, o bot pausa automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.human_takeover_enabled ?? true}
                  onCheckedChange={(v) => update('human_takeover_enabled', v)}
                />
                <Label>Ativar detecção de handoff humano</Label>
              </div>
              <div className="space-y-2">
                <Label>Comando de reativação do bot</Label>
                <Input
                  placeholder="#bot"
                  value={form.human_resume_command || '#bot'}
                  onChange={(e) => update('human_resume_command', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O atendente digita este comando para devolver o controle ao bot
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Minutos de pausa</Label>
                  <span className="text-sm font-medium">{form.chatbot_stop_minutes ?? 60}min</span>
                </div>
                <Slider
                  min={5} max={1440} step={5}
                  value={[form.chatbot_stop_minutes ?? 60]}
                  onValueChange={(v) => update('chatbot_stop_minutes', Array.isArray(v) ? v[0] : v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 8: Escalation */}
        <TabsContent value="escalation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Escalação e Notificações</CardTitle>
              <CardDescription>Configure para onde o agente envia alertas e pedidos importantes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Telefone de notificação</Label>
                <Input
                  placeholder="5511999999999"
                  value={form.escalation_phone || ''}
                  onChange={(e) => update('escalation_phone', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Grupo de notificação (JID)</Label>
                <Input
                  placeholder="120363403175153186@g.us"
                  value={form.escalation_group_jid || ''}
                  onChange={(e) => update('escalation_group_jid', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Instrução de escalação</Label>
                <Input
                  placeholder="Quando o cliente fizer um pedido, envie para o grupo de pedidos"
                  value={form.escalation_prompt || ''}
                  onChange={(e) => update('escalation_prompt', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
