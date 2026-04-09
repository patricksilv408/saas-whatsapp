import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Users, Bot, MessageSquare, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Verify admin
  const { data: me } = await admin.from('users').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/dashboard')

  const [
    { data: users, count: totalUsers },
    { data: agents, count: totalAgents },
    { data: recentMessages },
  ] = await Promise.all([
    admin.from('users').select('*, plans(name)', { count: 'exact' }).order('created_at', { ascending: false }).limit(50),
    admin.from('agents').select('id, name, is_active, connection_status, total_messages, users(email)', { count: 'exact' }).order('created_at', { ascending: false }).limit(50),
    admin.from('messages').select('id').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const totalMsgs24h = recentMessages?.length || 0

  const stats = [
    { label: 'Usuários', value: totalUsers || 0, icon: Users },
    { label: 'Agentes', value: totalAgents || 0, icon: Bot },
    { label: 'Mensagens (24h)', value: totalMsgs24h, icon: MessageSquare },
  ]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Painel Admin</h1>

      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Icon className="h-4 w-4" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Usuários</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Tokens (mês)</TableHead>
                <TableHead>Mensagens (mês)</TableHead>
                <TableHead>Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>{u.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{u.plans?.name || 'Free'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? 'default' : 'secondary'}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_admin && <Badge variant="destructive">Admin</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{u.tokens_used_month?.toLocaleString() || 0}</TableCell>
                  <TableCell className="text-right">{u.messages_used_month?.toLocaleString() || 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Agentes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Dono</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Total Msgs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.users?.email || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? 'default' : 'secondary'}>
                      {a.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.connection_status === 'open' ? 'default' : 'outline'}>
                      {a.connection_status || 'desconectado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{a.total_messages?.toLocaleString() || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
