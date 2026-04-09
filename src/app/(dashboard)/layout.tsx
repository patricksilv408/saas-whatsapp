import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/layout/sidebar'
import { User } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: userProfile } = await admin
    .from('users')
    .select('*, plan:plans(*)')
    .eq('id', authUser.id)
    .single()

  if (!userProfile) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={userProfile as User} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
