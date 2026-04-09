import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageSquare, Users, Zap, Settings, Bot, Wifi, WifiOff } from 'lucide-react'
import Link from 'next/link'

export default async function AgentOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: agent }, { data: customers }, { data: recentMessages }] = await Promise.all([
    admin.from('agents').select('*').eq('id', id).single(),
    admin.from('customers').select('id', { count: 'exact' }).eq('agent_id', id),
    admin.from('messages')
      .select('id, direction, content, content_type, created_at')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (!agent) redirect('/agents')

  const isConnected = agent.connection_status === 'open'

  const stats = [
    { label: 'Total Mensagens', value: agent.total_messages?.toLocaleString() ?? '0', icon: MessageSquare },
    { label: 'Clientes', value: customers?.length?.toLocaleString() ?? '0', icon: Users },
    { label: 'Tokens Usados', value: agent.total_tokens_used?.toLocaleString() ?? '0', icon: Zap },
  ]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          {agent.description && <p className="text-muted-foreground mt-1">{agent.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1.5">
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/agents/${id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />Configurações
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Icon className="h-4 w-4" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Configuração do Agente</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provedor LLM</span>
              <span className="font-medium capitalize">{agent.llm_provider || 'openai'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modelo</span>
              <span className="font-medium font-mono text-xs">{agent.llm_model || 'gpt-4o-mini'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temperatura</span>
              <span className="font-medium">{agent.llm_temperature}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transcrição de áudio</span>
              <Badge variant={agent.transcribe_audio ? 'default' : 'secondary'} className="text-xs">
                {agent.transcribe_audio ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Handoff humano</span>
              <Badge variant={agent.human_takeover_enabled ? 'default' : 'secondary'} className="text-xs">
                {agent.human_takeover_enabled ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mensagens Recentes</CardTitle></CardHeader>
          <CardContent>
            {!recentMessages || recentMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma mensagem ainda</p>
            ) : (
              <div className="space-y-2">
                {recentMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <Badge variant={msg.direction === 'inbound' ? 'outline' : 'secondary'} className="text-xs mt-0.5 shrink-0">
                      {msg.direction === 'inbound' ? 'Entrada' : 'Saída'}
                    </Badge>
                    <p className="text-xs text-muted-foreground line-clamp-1 flex-1">
                      {msg.content || `[${msg.content_type}]`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href={`/agents/${id}/inbox`}>
            <MessageSquare className="h-4 w-4 mr-2" />Abrir Inbox
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/agents/${id}/analytics`}>
            <Zap className="h-4 w-4 mr-2" />Ver Analytics
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/agents/${id}/customers`}>
            <Users className="h-4 w-4 mr-2" />Ver Clientes
          </Link>
        </Button>
      </div>
    </div>
  )
}
