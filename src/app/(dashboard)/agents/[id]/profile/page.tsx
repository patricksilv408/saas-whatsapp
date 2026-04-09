'use client'

import { useEffect, useState, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'

interface BusinessProfile {
  name?: string
  description?: string
  address?: string
  email?: string
  website?: string
  category?: string
}

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<BusinessProfile>({})

  useEffect(() => { loadProfile() }, [agentId])

  async function loadProfile() {
    setLoading(true)
    try {
      const res = await fetch(`/api/uazapi/${agentId}/business/profile`)
      if (res.ok) {
        const data = await res.json()
        setProfile({
          name: data.name || '',
          description: data.description || '',
          address: data.address || '',
          email: data.email || '',
          website: data.website || '',
          category: data.category || '',
        })
      }
    } catch {}
    setLoading(false)
  }

  async function saveProfile() {
    setSaving(true)
    try {
      const res = await fetch(`/api/uazapi/${agentId}/business/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (res.ok) {
        toast.success('Perfil atualizado com sucesso')
      } else {
        toast.error('Erro ao atualizar perfil')
      }
    } catch {
      toast.error('Erro ao atualizar perfil')
    }
    setSaving(false)
  }

  function update(field: keyof BusinessProfile, value: string) {
    setProfile(p => ({ ...p, [field]: value }))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Perfil do WhatsApp Business</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Negócio</CardTitle>
          <CardDescription>
            Essas informações aparecem no perfil do WhatsApp Business do seu agente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nome do negócio</Label>
            <Input
              value={profile.name || ''}
              onChange={e => update('name', e.target.value)}
              placeholder="Nome da empresa"
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea
              value={profile.description || ''}
              onChange={e => update('description', e.target.value)}
              placeholder="Breve descrição do negócio..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={profile.email || ''}
                onChange={e => update('email', e.target.value)}
                placeholder="contato@empresa.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Website</Label>
              <Input
                value={profile.website || ''}
                onChange={e => update('website', e.target.value)}
                placeholder="https://empresa.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Endereço</Label>
            <Input
              value={profile.address || ''}
              onChange={e => update('address', e.target.value)}
              placeholder="Rua, número, cidade"
            />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Input
              value={profile.category || ''}
              onChange={e => update('category', e.target.value)}
              placeholder="ex: Varejo, Serviços, Saúde..."
            />
          </div>

          <Button onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar Perfil
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
