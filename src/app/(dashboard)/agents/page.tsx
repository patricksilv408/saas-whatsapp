import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, Plus, MessageSquare, Zap, Settings, Inbox } from 'lucide-react'

const statusConfig = {
  connected: { label: 'Conectado', color: 'bg-green-500' },
  disconnected: { label: 'Desconectado', color: 'bg-gray-400' },
  connecting: { label: 'Conectando...', color: 'bg-yellow-500 animate-pulse' },
  qr_code: { label: 'Aguardando QR', color: 'bg-blue-500 animate-pulse' },
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: agents } = await admin
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: userProfile } = await admin
    .from('users')
    .select('*, plan:plans(*)')
    .eq('id', user.id)
    .single()

  const maxAgents = (userProfile as any)?.plan?.max_agents ?? 1
  const canCreate = (agents?.length ?? 0) < maxAgents

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes</h1>
          <p className="text-muted-foreground">
            {agents?.length ?? 0} de {maxAgents} agentes usados
          </p>
        </div>
        <Button asChild disabled={!canCreate}>
          <Link href="/agents/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Agente
          </Link>
        </Button>
      </div>

      {!agents?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Bot className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum agente criado</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Crie seu primeiro agente de IA para começar a atender clientes no WhatsApp.
            </p>
            <Button asChild>
              <Link href="/agents/new">
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Agente
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const status = (statusConfig as any)[agent.connection_status || 'disconnected'] || statusConfig.disconnected
            return (
              <Card key={agent.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{agent.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${status.color}`} />
                          <span className="text-xs text-muted-foreground">{status.label}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? 'default' : 'secondary'} className="flex-shrink-0">
                      {agent.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="text-xs">Mensagens</span>
                      </div>
                      <p className="font-semibold text-sm">{(agent.total_messages || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-xs">Tokens</span>
                      </div>
                      <p className="font-semibold text-sm">{(agent.total_tokens_used || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link href={`/agents/${agent.id}/inbox`}>
                        <Inbox className="mr-1.5 h-3.5 w-3.5" />
                        Inbox
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link href={`/agents/${agent.id}/settings`}>
                        <Settings className="mr-1.5 h-3.5 w-3.5" />
                        Config
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
