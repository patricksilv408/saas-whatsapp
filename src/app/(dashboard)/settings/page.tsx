import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { User, CreditCard, Activity } from 'lucide-react'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('*, plans(*)')
    .eq('id', user.id)
    .single()

  const plan = profile?.plans as any
  const tokenPct = plan ? Math.min(100, Math.round((profile.tokens_used_month / plan.max_tokens_month) * 100)) : 0
  const msgPct = plan ? Math.min(100, Math.round((profile.messages_used_month / plan.max_messages_month) * 100)) : 0

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Configurações da Conta</h1>

      <SettingsForm
        userId={user.id}
        initialName={profile?.name || ''}
        initialEmail={user.email || ''}
        initialUazapiUrl={profile?.custom_uazapi_url || ''}
        initialUazapiToken={profile?.custom_uazapi_admintoken || ''}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />Plano Atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-lg">{plan?.name || 'Free'}</span>
            <Badge variant="outline">R$ {plan?.price_brl?.toFixed(2) || '0,00'}/mês</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Agentes</p>
              <p className="font-medium">{plan?.max_agents || 1} máx.</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mensagens/mês</p>
              <p className="font-medium">{plan?.max_messages_month?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />Uso este Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Tokens</span>
              <span>{profile?.tokens_used_month?.toLocaleString() || 0} / {plan?.max_tokens_month?.toLocaleString() || 0}</span>
            </div>
            <Progress value={tokenPct} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Mensagens</span>
              <span>{profile?.messages_used_month?.toLocaleString() || 0} / {plan?.max_messages_month?.toLocaleString() || 0}</span>
            </div>
            <Progress value={msgPct} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
