import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Users, Zap, Clock } from 'lucide-react'

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: agent }, { data: messages }, { data: customers }] = await Promise.all([
    admin.from('agents').select('name, total_messages, total_tokens_used').eq('id', id).single(),
    admin.from('messages').select('created_at, direction, llm_tokens_used, content_type')
      .eq('agent_id', id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
    admin.from('customers').select('id, total_interactions, created_at').eq('agent_id', id),
  ])

  const inbound = messages?.filter(m => m.direction === 'inbound') || []
  const outbound = messages?.filter(m => m.direction === 'outbound') || []
  const totalTokens = outbound.reduce((s, m) => s + (m.llm_tokens_used || 0), 0)

  const contentTypeCounts = (messages || []).reduce((acc: Record<string, number>, m) => {
    acc[m.content_type || 'text'] = (acc[m.content_type || 'text'] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Analytics — {agent?.name}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />Mensagens (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inbound.length.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{outbound.length} respostas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{customers?.length?.toLocaleString() ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />Tokens (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />Total Histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{agent?.total_messages?.toLocaleString() ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Tipos de Mensagem Recebida (30d)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(contentTypeCounts)
              .sort(([,a], [,b]) => b - a)
              .map(([type, count]) => {
                const total = Object.values(contentTypeCounts).reduce((a, b) => a + b, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-20 text-sm capitalize text-muted-foreground">{type}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right text-sm font-medium">{count} ({pct}%)</span>
                  </div>
                )
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
