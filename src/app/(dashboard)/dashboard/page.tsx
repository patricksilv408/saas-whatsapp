import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, MessageSquare, Users, Zap } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const [{ data: agents }, { data: userProfile }] = await Promise.all([
    admin.from('agents').select('id, name, is_active, total_messages, connection_status').eq('user_id', authUser.id),
    admin.from('users').select('*, plan:plans(*)').eq('id', authUser.id).single(),
  ])

  const totalMessages = agents?.reduce((sum, a) => sum + (a.total_messages || 0), 0) ?? 0
  const activeAgents = agents?.filter((a) => a.is_active && a.connection_status === 'connected').length ?? 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo de volta, {userProfile?.name || 'usuário'}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Agentes</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">{activeAgents} conectados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens (total)</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Acumulado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uso do Plano</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userProfile?.messages_used_month?.toLocaleString() ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              de {(userProfile as any)?.plan?.max_messages_month?.toLocaleString() ?? '∞'} este mês
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tokens Usados</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(userProfile?.tokens_used_month ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              de {((userProfile as any)?.plan?.max_tokens_month ?? 0).toLocaleString()} este mês
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agents list */}
      <Card>
        <CardHeader>
          <CardTitle>Seus Agentes</CardTitle>
        </CardHeader>
        <CardContent>
          {!agents || agents.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Bot className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p>Nenhum agente criado ainda.</p>
              <a href="/agents/new" className="mt-2 inline-block text-sm text-primary hover:underline">
                Criar primeiro agente →
              </a>
            </div>
          ) : (
            <div className="divide-y">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      agent.connection_status === 'connected' ? 'bg-green-500' :
                      agent.connection_status === 'connecting' ? 'bg-yellow-500' :
                      'bg-gray-300'
                    }`} />
                    <div>
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{agent.connection_status || 'desconectado'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{(agent.total_messages || 0).toLocaleString()} msgs</span>
                    <a href={`/agents/${agent.id}`} className="text-primary hover:underline">Ver →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
