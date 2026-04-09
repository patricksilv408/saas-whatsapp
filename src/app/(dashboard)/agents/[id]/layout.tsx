import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AgentNav } from '@/components/agents/agent-nav'

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('id, name, connection_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) redirect('/agents')

  return (
    <div className="flex flex-col h-full">
      <AgentNav agentId={id} agentName={agent.name} connectionStatus={agent.connection_status} />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
