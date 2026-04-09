'use client'

import { useEffect, useState, use } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Upload, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { Agent, KnowledgeItem, Product, AgentFunction } from '@/types'

const MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20251101', 'claude-haiku-4-5-20251001'],
  google: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
}

export default function AIConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [form, setForm] = useState<Partial<Agent>>({})
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKey, setApiKey] = useState('')

  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [agentFunctions, setAgentFunctions] = useState<AgentFunction[]>([])
  const [uploadingKb, setUploadingKb] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    const [agentRes, kbRes, prodRes, fnRes] = await Promise.all([
      fetch(`/api/agents/${id}`),
      fetch(`/api/agents/${id}/knowledge`),
      fetch(`/api/agents/${id}/products`),
      fetch(`/api/agents/${id}/functions`),
    ])

    if (agentRes.ok) {
      const a = await agentRes.json()
      setAgent(a)
      setForm(a)
    }
    if (kbRes.ok) setKnowledgeItems(await kbRes.json())
    if (prodRes.ok) setProducts(await prodRes.json())
    if (fnRes.ok) setAgentFunctions(await fnRes.json())
  }

  async function handleSave() {
    setSaving(true)
    const body: Record<string, unknown> = { ...form }
    if (apiKey.trim()) body.llm_api_key = apiKey.trim()

    await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    setApiKey('')
  }

  async function handleKbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingKb(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('agentId', id)

    await fetch('/api/upload/knowledge', { method: 'POST', body: formData })
    await loadData()
    setUploadingKb(false)
  }

  async function deleteKbItem(itemId: string) {
    await fetch(`/api/agents/${id}/knowledge/${itemId}`, { method: 'DELETE' })
    setKnowledgeItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const provider = (form.llm_provider || 'openai') as keyof typeof MODELS

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configuração de IA — {agent.name}</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <Tabs defaultValue="llm">
        <TabsList>
          <TabsTrigger value="llm">LLM</TabsTrigger>
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="memory">Memória</TabsTrigger>
          <TabsTrigger value="knowledge">Base de Conhecimento</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="functions">Funções</TabsTrigger>
        </TabsList>

        {/* LLM Config */}
        <TabsContent value="llm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provedor de LLM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Provedor</Label>
                <Select value={provider} onValueChange={(v) => update('llm_provider', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={form.llm_model || ''} onValueChange={(v) => update('llm_model', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(MODELS[provider] || []).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>API Key {agent.has_llm_api_key && <Badge variant="outline" className="ml-2">Configurada</Badge>}</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={agent.has_llm_api_key ? 'Digite para alterar' : 'sk-...'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-2.5 text-muted-foreground"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Temperatura</Label>
                  <span className="text-sm font-medium">{form.llm_temperature ?? 0.7}</span>
                </div>
                <Slider
                  min={0} max={2} step={0.1}
                  value={[form.llm_temperature ?? 0.7]}
                  onValueChange={(v) => update('llm_temperature', Array.isArray(v) ? v[0] : v)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={form.llm_max_tokens ?? 1000}
                  onChange={(e) => update('llm_max_tokens', parseInt(e.target.value))}
                  min={100}
                  max={128000}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt */}
        <TabsContent value="prompt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                Variáveis disponíveis: {'{{customer_name}}'}, {'{{customer_phone}}'}, {'{{customer_data}}'}, {'{{current_date}}'}, {'{{current_time}}'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[400px] font-mono text-sm"
                placeholder="Você é um assistente de atendimento..."
                value={form.system_prompt || ''}
                onChange={(e) => update('system_prompt', e.target.value)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory */}
        <TabsContent value="memory" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Curto Prazo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Interações a manter no contexto</Label>
                  <span className="text-sm font-medium">{form.short_term_memory_turns ?? 10}</span>
                </div>
                <Slider
                  min={1} max={50} step={1}
                  value={[form.short_term_memory_turns ?? 10]}
                  onValueChange={(v) => update('short_term_memory_turns', Array.isArray(v) ? v[0] : v)}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Memória de Longo Prazo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.long_term_memory_enabled ?? false}
                  onCheckedChange={(v) => update('long_term_memory_enabled', v)}
                />
                <Label>Ativar memória de longo prazo (resumo comprimido)</Label>
              </div>
              {form.long_term_memory_enabled && (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label>Comprimir a cada N mensagens</Label>
                    <span className="text-sm font-medium">{form.long_term_memory_compress_every ?? 20}</span>
                  </div>
                  <Slider
                    min={10} max={100} step={5}
                    value={[form.long_term_memory_compress_every ?? 20]}
                    onValueChange={(v) => update('long_term_memory_compress_every', Array.isArray(v) ? v[0] : v)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge Base */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Base de Conhecimento</CardTitle>
              <CardDescription>Documentos que o agente consulta via busca semântica (RAG)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="kb-upload">Adicionar documento (PDF, CSV, TXT)</Label>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    id="kb-upload"
                    type="file"
                    accept=".pdf,.csv,.txt"
                    onChange={handleKbUpload}
                    className="max-w-sm"
                  />
                  {uploadingKb && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </div>
              <div className="space-y-2">
                {knowledgeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum documento adicionado ainda
                  </p>
                ) : (
                  knowledgeItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.file_type?.toUpperCase()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteKbItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Catálogo de Produtos</CardTitle>
              <CardDescription>O agente busca produtos relevantes via busca semântica</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button size="sm" asChild>
                  <a href={`/agents/${id}/products/new`}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Adicionar Produto
                  </a>
                </Button>
              </div>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum produto cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.category} — R$ {p.price?.toFixed(2) ?? '—'}
                        </p>
                      </div>
                      <Badge variant={p.is_active ? 'default' : 'secondary'}>
                        {p.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Functions */}
        <TabsContent value="functions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Funções HTTP Customizadas</CardTitle>
              <CardDescription>O agente pode chamar APIs externas como tools do LLM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button size="sm" asChild>
                  <a href={`/agents/${id}/functions/new`}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Nova Função
                  </a>
                </Button>
              </div>
              {agentFunctions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma função configurada</p>
              ) : (
                <div className="space-y-2">
                  {agentFunctions.map((fn) => (
                    <div key={fn.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">{fn.name}</p>
                        <p className="text-xs text-muted-foreground">{fn.http_method} {fn.http_url}</p>
                      </div>
                      <Badge variant={fn.is_active ? 'default' : 'secondary'}>
                        {fn.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
