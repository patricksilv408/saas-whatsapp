'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Settings, Brain, MessageSquare, Users, Zap, BarChart2, Megaphone, User, Wifi, WifiOff } from 'lucide-react'

interface Props {
  agentId: string
  agentName: string
  connectionStatus?: string | null
}

const navItems = [
  { href: '', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/ai', label: 'IA', icon: Brain },
  { href: '/settings', label: 'Configurações', icon: Settings },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/triggers', label: 'Triggers', icon: Zap },
  { href: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/profile', label: 'Perfil WA', icon: User },
]

export function AgentNav({ agentId, agentName, connectionStatus }: Props) {
  const pathname = usePathname()
  const base = `/agents/${agentId}`
  const isConnected = connectionStatus === 'open'

  return (
    <div className="border-b bg-background">
      <div className="flex items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{agentName}</span>
          <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1 shrink-0 text-xs">
            {isConnected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {isConnected ? 'Conectado' : 'Offline'}
          </Badge>
        </div>
      </div>
      <nav className="flex gap-1 px-4 overflow-x-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const fullHref = `${base}${href}`
          const isActive = href === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(fullHref)

          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
