export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Plan {
  id: string
  name: string
  max_agents: number
  max_tokens_month: number
  max_messages_month: number
  price_brl: number
  features: Json
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string | null
  plan_id: string | null
  is_admin: boolean
  is_active: boolean
  tokens_used_month: number
  messages_used_month: number
  custom_uazapi_url: string | null
  custom_uazapi_admintoken: string | null
  created_at: string
  updated_at: string
  plan?: Plan
}

export type LLMProvider = 'openai' | 'anthropic' | 'google'
export type GroupMode = 'ignore_all' | 'all_groups' | 'selected_groups'
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_code'

export interface Agent {
  id: string
  user_id: string
  name: string
  description: string | null
  is_active: boolean
  uazapi_instance_id: string | null
  uazapi_token: string | null
  uazapi_webhook_id: string | null
  webhook_secret: string
  llm_provider: LLMProvider
  llm_model: string
  llm_api_key_encrypted: string | null
  has_llm_api_key?: boolean
  llm_temperature: number
  llm_max_tokens: number
  system_prompt: string | null
  group_mode: GroupMode
  allowed_group_jids: string[]
  auto_add_contacts: boolean
  message_debounce_seconds: number
  send_typing_indicator: boolean
  send_read_receipt: boolean
  human_takeover_enabled: boolean
  human_resume_command: string
  chatbot_stop_minutes: number
  read_images: boolean
  read_documents: boolean
  transcribe_audio: boolean
  send_audio_response: boolean
  elevenlabs_api_key_encrypted: string | null
  has_elevenlabs_api_key?: boolean
  elevenlabs_voice_id: string | null
  split_messages: boolean
  allow_send_audio: boolean
  allow_send_video: boolean
  allow_send_image: boolean
  allow_send_document: boolean
  short_term_memory_turns: number
  long_term_memory_enabled: boolean
  long_term_memory_compress_every: number
  escalation_phone: string | null
  escalation_group_jid: string | null
  escalation_prompt: string | null
  total_messages: number
  total_tokens_used: number
  connection_status: ConnectionStatus
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  agent_id: string
  phone: string
  name: string | null
  email: string | null
  custom_fields: Json
  long_term_memory: string | null
  last_interaction_at: string | null
  total_interactions: number
  is_blocked: boolean
  chatbot_disabled_until: string | null
  human_attendant_id: string | null
  created_at: string
  updated_at: string
  human_attendant?: User
}

export type MessageDirection = 'inbound' | 'outbound'
export type MessageContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'sticker'

export interface Message {
  id: string
  agent_id: string
  customer_id: string
  direction: MessageDirection
  content_type: MessageContentType
  content: string | null
  media_url: string | null
  media_mime_type: string | null
  uazapi_message_id: string | null
  llm_tokens_used: number
  is_from_human_attendant: boolean
  created_at: string
  customer?: Customer
}

export interface MemoryTurn {
  id: string
  agent_id: string
  customer_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface KnowledgeItem {
  id: string
  agent_id: string
  title: string
  content: string
  file_url: string | null
  file_type: 'text' | 'pdf' | 'csv'
  uazapi_knowledge_id: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  agent_id: string
  name: string
  description: string | null
  price: number | null
  image_url: string | null
  category: string | null
  is_active: boolean
  created_at: string
}

export interface AgentFile {
  id: string
  agent_id: string
  name: string
  description: string | null
  storage_path: string
  public_url: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface AgentFunction {
  id: string
  agent_id: string
  name: string
  description: string | null
  http_method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  http_url: string
  http_headers: Json
  parameters_schema: Json
  uazapi_function_id: string | null
  is_active: boolean
  created_at: string
}

export interface AgentTrigger {
  id: string
  agent_id: string
  keyword: string
  match_type: 'contains' | 'exact' | 'startsWith' | 'regex'
  action: 'message' | 'agent' | 'transfer_human'
  response: string | null
  uazapi_trigger_id: string | null
  is_active: boolean
  created_at: string
}

export interface AgentLabel {
  id: string
  agent_id: string
  name: string
  color: string
  uazapi_label_id: string | null
  created_at: string
}

export interface QuickReply {
  id: string
  agent_id: string
  shortcut: string
  message: string
  created_at: string
}

export interface UsageLog {
  id: string
  user_id: string
  agent_id: string | null
  action_type: 'message_processed' | 'tts' | 'stt' | 'embedding'
  tokens_used: number
  cost_usd: number
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  agent_id: string | null
  customer_phone: string | null
  is_read: boolean
  created_at: string
}

// Webhook payload from UazAPI
export interface UazAPIWebhookEvent {
  event: string
  instance: string
  data: {
    key?: {
      remoteJid: string
      fromMe: boolean
      id: string
    }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { caption?: string; mimetype: string; url: string }
      audioMessage?: { url: string; mimetype: string; seconds: number }
      videoMessage?: { caption?: string; url: string; mimetype: string }
      documentMessage?: { caption?: string; url: string; mimetype: string; fileName: string }
      locationMessage?: { degreesLatitude: number; degreesLongitude: number; name?: string }
    }
    messageType?: string
    messageTimestamp?: number
    instanceId?: string
    source?: string
    status?: string
  }
}

// BullMQ job data
export interface MessageJobData {
  agentId: string
  userId: string
  chatId: string
  phone: string
  pushName: string | null
  isGroup: boolean
  groupJid: string | null
  messageId: string
  messageType: string
  content: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  receivedAt: number
}
