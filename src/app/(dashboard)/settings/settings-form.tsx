'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  userId: string
  initialName: string
  initialEmail: string
  initialUazapiUrl: string
  initialUazapiToken: string
}

export function SettingsForm({ userId, initialName, initialEmail, initialUazapiUrl, initialUazapiToken }: Props) {
  const [name, setName] = useState(initialName)
  const [uazapiUrl, setUazapiUrl] = useState(initialUazapiUrl)
  const [uazapiToken, setUazapiToken] = useState(initialUazapiToken)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, custom_uazapi_url: uazapiUrl, custom_uazapi_admintoken: uazapiToken }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Configurações salvas')
    } else {
      toast.error('Erro ao salvar')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />Perfil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" />
        </div>
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input value={initialEmail} disabled />
        </div>

        <div className="pt-2 border-t">
          <CardDescription className="mb-3">UazAPI Personalizado (opcional)</CardDescription>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>URL da instância UazAPI</Label>
              <Input
                value={uazapiUrl}
                onChange={e => setUazapiUrl(e.target.value)}
                placeholder="https://sua-instancia.uazapi.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Admin Token</Label>
              <Input
                type="password"
                value={uazapiToken}
                onChange={e => setUazapiToken(e.target.value)}
                placeholder="Token de administrador"
              />
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}
