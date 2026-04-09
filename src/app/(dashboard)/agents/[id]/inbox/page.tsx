'use client'

import { useEffect, useState, useRef, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Bot, User, Send, Phone, Search, UserCheck, UserX,
  MessageSquare, Loader2
} from 'lucide-react'
import { Message, Customer } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ConversationSummary {
  customer: Customer
  lastMessage: Message | null
  unreadCount: number
  botActive: boolean
}

export default function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    loadConversations()

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`inbox-${agentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `agent_id=eq.${agentId}` },
        (payload) => {
          const newMsg = payload.new as Message
          if (selectedCustomer && newMsg.customer_id === selectedCustomer.id) {
            setMessages((prev) => [...prev, newMsg])
            scrollToBottom()
          }
          loadConversations()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [agentId])

  useEffect(() => {
    if (selectedCustomer) loadMessages(selectedCustomer.id)
  }, [selectedCustomer])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function loadConversations() {
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .eq('agent_id', agentId)
      .order('last_interaction_at', { ascending: false })
      .limit(100)

    if (!customers) { setLoading(false); return }

    const summaries = await Promise.all(
      customers.map(async (customer) => {
        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(1)

        const botActive = !customer.chatbot_disabled_until ||
          new Date(customer.chatbot_disabled_until) < new Date()

        return {
          customer,
          lastMessage: msgs?.[0] || null,
          unreadCount: 0,
          botActive,
        }
      })
    )

    setConversations(summaries)
    setLoading(false)
  }

  async function loadMessages(customerId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('agent_id', agentId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(100)

    setMessages(data || [])
    setTimeout(scrollToBottom, 100)
  }

  async function sendMessage() {
    if (!inputText.trim() || !selectedCustomer) return
    setSending(true)

    const res = await fetch(`/api/agents/${agentId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerPhone: selectedCustomer.phone,
        customerId: selectedCustomer.id,
        text: inputText,
      }),
    })

    if (res.ok) {
      setInputText('')
      await loadMessages(selectedCustomer.id)
    }

    setSending(false)
  }

  async function toggleBot(enable: boolean) {
    if (!selectedCustomer) return
    await supabase.from('customers').update({
      chatbot_disabled_until: enable ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      human_attendant_id: enable ? null : undefined,
    }).eq('id', selectedCustomer.id)
    loadConversations()
  }

  const filteredConversations = conversations.filter((c) =>
    !search || c.customer.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer.phone.includes(search)
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: Conversation list */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col">
        <div className="p-3 border-b">
          <h2 className="font-semibold mb-2">Conversas</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filteredConversations.map(({ customer, lastMessage, botActive }) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className={`w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b text-left ${
                  selectedCustomer?.id === customer.id ? 'bg-muted' : ''
                }`}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="text-sm">
                    {(customer.name || customer.phone).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-medium text-sm truncate">
                      {customer.name || customer.phone}
                    </p>
                    {lastMessage && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(lastMessage.created_at), {
                          addSuffix: false,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${botActive ? 'bg-green-500' : 'bg-orange-500'}`} />
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMessage?.content || 'Sem mensagens'}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right: Chat */}
      {selectedCustomer ? (
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="border-b p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {(selectedCustomer.name || selectedCustomer.phone).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{selectedCustomer.name || selectedCustomer.phone}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!selectedCustomer.chatbot_disabled_until ||
                new Date(selectedCustomer.chatbot_disabled_until) < new Date() ? (
                <Button variant="outline" size="sm" onClick={() => toggleBot(false)}>
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                  Assumir
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => toggleBot(true)}>
                  <Bot className="mr-1.5 h-3.5 w-3.5" />
                  Devolver ao Bot
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {messages.map((msg) => {
                const isInbound = msg.direction === 'inbound'
                const isHuman = msg.is_from_human_attendant

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`flex items-end gap-2 max-w-[75%] ${isInbound ? '' : 'flex-row-reverse'}`}>
                      {isInbound ? (
                        <User className="h-6 w-6 text-muted-foreground flex-shrink-0 mb-1" />
                      ) : isHuman ? (
                        <UserCheck className="h-6 w-6 text-blue-500 flex-shrink-0 mb-1" />
                      ) : (
                        <Bot className="h-6 w-6 text-primary flex-shrink-0 mb-1" />
                      )}
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                          isInbound
                            ? 'bg-muted rounded-bl-sm'
                            : isHuman
                            ? 'bg-blue-100 text-blue-900 rounded-br-sm'
                            : 'bg-primary text-primary-foreground rounded-br-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content || '[mídia]'}</p>
                        <p className={`text-[10px] mt-1 ${isInbound ? 'text-muted-foreground' : 'opacity-70'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              placeholder="Digite uma mensagem..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={sending || !inputText.trim()} size="icon">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma conversa</p>
          <p className="text-sm mt-1">Escolha um contato na lista à esquerda</p>
        </div>
      )}
    </div>
  )
}
