'use client'

import { useEffect, useState, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { AgentTrigger, QuickReply } from '@/types'

export default function TriggersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params)
  const [triggers, setTriggers] = useState<AgentTrigger[]>([])
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)

  const [newTrigger, setNewTrigger] = useState({
    keyword: '',
    match_type: 'contains',
    action: 'message',
    response: '',
    is_active: true,
  })

  const [newReply, setNewReply] = useState({ shortcut: '', message: '' })

  useEffect(() => { loadData() }, [agentId])

  async function loadData() {
    const [tRes, qRes] = await Promise.all([
      fetch(`/api/agents/${agentId}/triggers`),
      fetch(`/api/agents/${agentId}/quick-replies`),
    ])
    if (tRes.ok) setTriggers(await tRes.json())
    if (qRes.ok) setQuickReplies(await qRes.json())
    setLoading(false)
  }

  async function addTrigger() {
    const res = await fetch(`/api/agents/${agentId}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTrigger),
    })
    if (res.ok) {
      await loadData()
      setNewTrigger({ keyword: '', match_type: 'contains', action: 'message', response: '', is_active: true })
    }
  }

  async function deleteTrigger(id: string) {
    await fetch(`/api/agents/${agentId}/triggers/${id}`, { method: 'DELETE' })
    setTriggers(prev => prev.filter(t => t.id !== id))
  }

  async function addReply() {
    const res = await fetch(`/api/agents/${agentId}/quick-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReply),
    })
    if (res.ok) {
      await loadData()
      setNewReply({ shortcut: '', message: '' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold">Triggers e Respostas Rápidas</h1>

      {/* Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Triggers (Palavras-chave)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Palavra-chave</Label>
                <Input placeholder="ex: oi, olá" value={newTrigger.keyword} onChange={e => setNewTrigger(p => ({...p, keyword: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>Tipo de Match</Label>
                <Select value={newTrigger.match_type} onValueChange={v => setNewTrigger(p => ({...p, match_type: v ?? 'contains'}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="exact">Exato</SelectItem>
                    <SelectItem value="startsWith">Começa com</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Resposta</Label>
              <Input placeholder="Mensagem de resposta..." value={newTrigger.response} onChange={e => setNewTrigger(p => ({...p, response: e.target.value}))} />
            </div>
            <Button onClick={addTrigger} disabled={!newTrigger.keyword.trim()}>
              <Plus className="mr-2 h-4 w-4" />Adicionar Trigger
            </Button>
          </div>

          {triggers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum trigger configurado</p>
          ) : (
            <div className="space-y-2">
              {triggers.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{t.match_type}</Badge>
                    <div>
                      <p className="font-mono text-sm">{t.keyword}</p>
                      <p className="text-xs text-muted-foreground">{t.response}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteTrigger(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Replies */}
      <Card>
        <CardHeader>
          <CardTitle>Respostas Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Atalho</Label>
                <Input placeholder="/oi" value={newReply.shortcut} onChange={e => setNewReply(p => ({...p, shortcut: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Input placeholder="Olá! Como posso ajudar?" value={newReply.message} onChange={e => setNewReply(p => ({...p, message: e.target.value}))} />
              </div>
            </div>
            <Button onClick={addReply} disabled={!newReply.shortcut.trim() || !newReply.message.trim()}>
              <Plus className="mr-2 h-4 w-4" />Adicionar Resposta
            </Button>
          </div>

          {quickReplies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma resposta rápida configurada</p>
          ) : (
            <div className="space-y-2">
              {quickReplies.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-mono text-sm text-primary">{r.shortcut}</p>
                    <p className="text-xs text-muted-foreground">{r.message}</p>
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
