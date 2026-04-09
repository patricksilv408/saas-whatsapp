'use client'

import { useState, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, Upload, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export default function CampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params)
  const [message, setMessage] = useState('')
  const [numbers, setNumbers] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<{ phone: string; success: boolean; error?: string }[]>([])
  const [delay, setDelay] = useState('3')

  function parseNumbers(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(n => n.length >= 10)
  }

  const parsed = parseNumbers(numbers)

  async function sendCampaign() {
    if (!message.trim() || parsed.length === 0) return
    setSending(true)
    setResults([])

    const delayMs = Math.max(1000, parseInt(delay) * 1000)
    const newResults: typeof results = []

    for (const phone of parsed) {
      try {
        const res = await fetch(`/api/agents/${agentId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, message }),
        })
        if (res.ok) {
          newResults.push({ phone, success: true })
        } else {
          const data = await res.json()
          newResults.push({ phone, success: false, error: data.error || 'Erro desconhecido' })
        }
      } catch (e: any) {
        newResults.push({ phone, success: false, error: e.message })
      }
      setResults([...newResults])
      if (phone !== parsed[parsed.length - 1]) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    setSending(false)
    const succeeded = newResults.filter(r => r.success).length
    toast.success(`Campanha finalizada: ${succeeded}/${parsed.length} enviados`)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Campanhas — Disparo em Massa</h1>

      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CardContent className="pt-4">
          <div className="flex gap-2 text-yellow-700 dark:text-yellow-400 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Atenção ao limite de disparos</p>
              <p className="text-xs mt-0.5">Use intervalos adequados entre mensagens para evitar bloqueio do número. Recomendado: mínimo 3 segundos entre envios.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagem</CardTitle>
              <CardDescription>Texto que será enviado para todos os contatos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Digite a mensagem da campanha..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">{message.length} caracteres</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Intervalo entre envios (segundos)</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={delay}
                  onChange={e => setDelay(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Contatos</CardTitle>
              <CardDescription>
                Cole os números separados por vírgula, ponto e vírgula ou nova linha.
                {parsed.length > 0 && <span className="text-primary"> {parsed.length} números válidos</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={"5511999990000\n5511888880000\n5511777770000"}
                value={numbers}
                onChange={e => setNumbers(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Button
        onClick={sendCampaign}
        disabled={sending || !message.trim() || parsed.length === 0}
        size="lg"
      >
        {sending ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
        ) : (
          <><Send className="mr-2 h-4 w-4" />Iniciar Disparo ({parsed.length} contatos)</>
        )}
      </Button>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado do Disparo</CardTitle>
            <CardDescription>
              {results.filter(r => r.success).length} enviados, {results.filter(r => !r.success).length} falhas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{r.phone}</span>
                  {r.success ? (
                    <Badge>Enviado</Badge>
                  ) : (
                    <Badge variant="destructive">Falha: {r.error}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
