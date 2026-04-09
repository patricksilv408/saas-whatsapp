'use client'

import { useEffect, useState, use } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Loader2, MessageSquare, Bot, User } from 'lucide-react'
import { Customer } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'

export default function CustomersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadCustomers()
  }, [page, search])

  async function loadCustomers() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)

    const res = await fetch(`/api/agents/${agentId}/customers?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCustomers(data.customers)
      setTotal(data.total)
    }
    setLoading(false)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <span className="text-muted-foreground">{total.toLocaleString()} clientes</span>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          className="pl-8"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Última Interação</TableHead>
                <TableHead>Mensagens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => {
                  const botActive = !c.chatbot_disabled_until ||
                    new Date(c.chatbot_disabled_until) < new Date()
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name || '—'}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>
                        {c.last_interaction_at
                          ? formatDistanceToNow(new Date(c.last_interaction_at), { addSuffix: true, locale: ptBR })
                          : '—'}
                      </TableCell>
                      <TableCell>{c.total_interactions}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {c.is_blocked && <Badge variant="destructive">Bloqueado</Badge>}
                          <Badge variant={botActive ? 'default' : 'secondary'}>
                            {botActive ? <><Bot className="mr-1 h-3 w-3" />Bot</> : <><User className="mr-1 h-3 w-3" />Humano</>}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/agents/${agentId}/inbox?customer=${c.id}`}>
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Ver chat
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {Math.ceil(total / 50)}</span>
          <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}
