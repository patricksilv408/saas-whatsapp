# Prompt para Claude Code — SaaS de Atendimento WhatsApp com UazAPI

## Contexto e Referência

Na pasta do projeto existem dois fluxos N8N que servem como referência de lógica de negócio:
- `ATENDIMENTO GÁS IDEAL UAZAPI.json` — fluxo principal de recebimento e processamento de mensagens
- `SEND_MESSAGE GÁS IDEAL.json` — subfluxo de envio de mensagem/notificação para grupos

Esses fluxos usam Supabase como banco de dados, UazAPI para WhatsApp e ElevenLabs para síntese de voz. Use-os como referência de lógica, **não** como código a copiar diretamente.

---

## Objetivo

Desenvolva um **SaaS multi-tenant completo** para atendimento ao cliente via WhatsApp, utilizando a [UazAPI](https://uazapi.com) como camada de comunicação. O sistema deve ser uma plataforma white-label onde um administrador vende acesso a usuários, cada um gerenciando seus próprios agentes de IA.

---

## Stack Tecnológica

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **Backend**: Next.js API Routes + serviço de workers Node.js separado para processamento de mensagens
- **Banco de dados**: Supabase (PostgreSQL) com Row Level Security (RLS)
- **Autenticação**: Supabase Auth (email/senha + magic link)
- **Storage**: Supabase Storage (bucket de imagens, documentos e áudios)
- **Vector Store**: pgvector no Supabase (extensão `vector`) para RAG/memória semântica
- **Fila de mensagens**: BullMQ + Redis para debounce de mensagens quebradas e jobs assíncronos
- **Realtime**: Supabase Realtime para atualizações ao vivo no dashboard
- **TTS (text-to-speech)**: ElevenLabs API (para respostas em áudio)
- **STT (speech-to-text)**: OpenAI Whisper ou Groq Whisper (para transcrição de áudios recebidos)
- **Deploy inicial**: Configurar para rodar localmente com `docker-compose` incluindo Redis e todos os serviços

---

## Estrutura de Banco de Dados

### Tabelas principais (schema `public`):

```sql
-- Planos disponíveis no SaaS
plans (id, name, max_agents, max_tokens_month, max_messages_month, price_brl, features jsonb)

-- Usuários do sistema (espelha auth.users do Supabase)
users (id, email, name, plan_id, is_admin, is_active, 
       tokens_used_month, messages_used_month, 
       custom_uazapi_url, custom_uazapi_admintoken,
       created_at, updated_at)

-- Agentes de IA criados pelos usuários
agents (id, user_id, name, description, is_active,
        -- UazAPI
        uazapi_instance_id, uazapi_token, uazapi_webhook_id,
        -- LLM
        llm_provider, -- 'openai' | 'anthropic' | 'google'
        llm_model, llm_api_key_encrypted, llm_temperature, llm_max_tokens,
        -- Prompt
        system_prompt,
        -- Comportamento de grupos
        group_mode, -- 'ignore_all' | 'all_groups' | 'selected_groups'
        allowed_group_jids text[], -- JIDs dos grupos permitidos
        -- Contatos
        auto_add_contacts, -- bool: adicionar novos números ao WA
        -- Mensagens quebradas (debounce)
        message_debounce_seconds, -- segundos de espera por mensagens quebradas (default 3)
        -- Indicadores de presença
        send_typing_indicator, -- bool: mostrar "digitando..."
        send_read_receipt, -- bool: marcar como lido ao receber
        -- Handoff humano
        human_takeover_enabled, -- bool
        human_resume_command, -- string: comando para agente reassumir (ex: "#bot")
        -- Mídia recebida
        read_images, read_documents, transcribe_audio,
        -- Mídia enviada
        send_audio_response, -- bool: responder em áudio se recebeu áudio
        split_messages, -- bool: quebrar resposta do agente em múltiplas msgs
        allow_send_audio, allow_send_video, allow_send_image, allow_send_document,
        -- Memória
        short_term_memory_turns, -- int: número de interações a lembrar
        long_term_memory_enabled, -- bool: resumo de longo prazo
        -- Notificação/escalation
        escalation_phone, escalation_group_jid, -- para onde o agente envia alertas
        escalation_prompt, -- instrução de quando/como escalar
        -- Métricas
        total_messages, total_tokens_used,
        created_at, updated_at)

-- Clientes atendidos por cada agente
customers (id, agent_id, phone, name, email,
           custom_fields jsonb, -- campos definidos no system_prompt
           long_term_memory text, -- resumo de longo prazo
           last_interaction_at, total_interactions,
           is_blocked, -- blacklist do agente
           chatbot_disabled_until, -- timestamp: quando o humano desativou o bot
           human_attendant_id, -- usuário que assumiu o atendimento
           created_at, updated_at)

-- Histórico de mensagens de cada conversa
messages (id, agent_id, customer_id, 
          direction, -- 'inbound' | 'outbound'
          content_type, -- 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'sticker'
          content text, -- texto ou transcrição
          media_url, media_mime_type,
          uazapi_message_id, -- ID da mensagem na UazAPI
          llm_tokens_used, -- tokens gastos nessa interação
          is_from_human_attendant, -- bool: mensagem enviada por humano, não pelo bot
          created_at)

-- Memória de curto prazo (últimas N interações por cliente)
memory_turns (id, agent_id, customer_id, role, -- 'user'|'assistant'
              content, created_at)

-- Base de conhecimento (Knowledge Base) por agente
knowledge_items (id, agent_id, title, content, 
                 file_url, file_type, -- 'text'|'pdf'|'csv'
                 embedding vector(1536), -- pgvector para RAG
                 uazapi_knowledge_id, -- ID na UazAPI (opcional, sync)
                 is_active, created_at)

-- Catálogo de produtos por agente
products (id, agent_id, name, description, price, 
          image_url, category, is_active,
          embedding vector(1536), -- busca semântica
          created_at)

-- Bucket de arquivos (imagens/docs) acessíveis pelo agente
agent_files (id, agent_id, name, description, 
             storage_path, public_url, mime_type, size_bytes,
             created_at)

-- Funções/tools customizadas por agente
agent_functions (id, agent_id, name, description,
                 http_method, http_url, http_headers jsonb,
                 parameters_schema jsonb, -- JSON Schema dos parâmetros
                 uazapi_function_id, -- ID na UazAPI
                 is_active, created_at)

-- Triggers/palavras-chave por agente
agent_triggers (id, agent_id, keyword, match_type,
                action, -- 'message'|'agent'|'transfer_human'
                response, uazapi_trigger_id, is_active, created_at)

-- Etiquetas por agente (sync com UazAPI labels)
agent_labels (id, agent_id, name, color, uazapi_label_id, created_at)

-- Quick replies por agente
quick_replies (id, agent_id, shortcut, message, created_at)

-- Logs de uso para faturamento
usage_logs (id, user_id, agent_id, action_type, -- 'message_processed'|'tts'|'stt'|'embedding'
            tokens_used, cost_usd, created_at)

-- Notificações internas do sistema
notifications (id, user_id, type, title, body, 
               agent_id, customer_phone, is_read, created_at)
```

---

## Módulo 1: Autenticação e Gestão de Usuários

### 1.1 — Rotas de autenticação
- Login, registro, logout, recuperação de senha via Supabase Auth
- Middleware Next.js protegendo todas as rotas `/app/*` e `/api/*`
- Perfis de role: `admin` e `user`

### 1.2 — Painel Admin (`/app/admin`)
- Listar todos os usuários com métricas: agentes ativos, mensagens do mês, tokens usados
- Criar/editar/desativar usuário
- Definir plano por usuário (quota de agentes, tokens/mês, mensagens/mês)
- Configurar **URL e admintoken da UazAPI** globais ou por usuário (para white-label com instância própria)
- Ver logs de uso consolidados
- Dashboard com gráficos: receita, usuários ativos, volume de mensagens

### 1.3 — Perfil do Usuário (`/app/settings`)
- Editar nome, email, senha
- Ver consumo do plano atual (barra de progresso: tokens e mensagens usados/limite)
- Chaves de API próprias (LLM providers)

---

## Módulo 2: Gestão de Agentes (`/app/agents`)

### 2.1 — Listagem de Agentes
- Cards com: nome, instância WA (status: conectado/desconectado/reconectando), mensagens hoje, tokens usados
- Badge de status da instância com cor (verde/amarelo/vermelho)
- Botão "Novo Agente" (bloqueado se atingiu quota do plano)

### 2.2 — Criação/Edição de Agente (wizard em abas)

#### Aba 1: Configurações Gerais
- Nome e descrição do agente
- **Ao criar**: chamar `POST /instance/init` na UazAPI com `admintoken` para criar instância → salvar `instance_id` e `token` retornados
- **Ao criar**: chamar `POST /webhook` para registrar o webhook da instância apontando para `/api/webhook/[agentId]`
- **Ao criar**: chamar `POST /instance/updatechatbotsettings` com `chatbot_enabled: true`

#### Aba 2: Conexão WhatsApp
- Botão "Conectar WhatsApp" → chamar `POST /instance/connect` → exibir QR Code em um modal (atualizar a cada 20s via polling em `GET /instance/status`)
- Ou opção "Conectar por Número" (paircode) → input de telefone → mostrar código de 8 dígitos
- Status ao vivo da conexão com Supabase Realtime
- Botão "Desconectar" (`POST /instance/disconnect`)
- **IMPORTANTE**: quando instância desconectar (webhook `connection` event), disparar notificação para o usuário e tentar reconexão automática após 30s (máx 3 tentativas)

#### Aba 3: Comportamento de Grupos
- Toggle: Ignorar todos os grupos / Responder em todos os grupos / Responder apenas em grupos selecionados
- Se "selecionados": buscar grupos conectados via `GET /group/list` e mostrar checkboxes com nome e foto do grupo
- Chamar `POST /instance/updatechatbotsettings` com `chatbot_ignoreGroups` conforme configuração

#### Aba 4: Mensagens e Presença
- **Mensagens quebradas**: slider de 1–30 segundos de debounce (aguardar msgs sequenciais antes de processar)
- Toggle: Mostrar "digitando..." durante processamento (`POST /message/presence` com `presence: composing`)
- Toggle: Marcar mensagem como lida ao receber (`POST /chat/read`)
- Toggle: Adicionar novos números à lista de contatos automaticamente (`POST /contact/add`)

#### Aba 5: Mídia Recebida
- Toggle: Ler e interpretar imagens (visão via LLM multimodal)
- Toggle: Ler e interpretar documentos (PDF → texto via extração)
- Toggle: Transcrever áudios recebidos (via Whisper/Groq) antes de enviar ao LLM

#### Aba 6: Mídia Enviada
- Toggle: Responder em áudio quando mensagem recebida for áudio (TTS via ElevenLabs)
  - Se ativado: campo para **ElevenLabs API Key** e **Voice ID** (dropdown com vozes disponíveis via API ElevenLabs)
- Toggle: Quebrar resposta longa em múltiplas mensagens (split por `\n\n` ou limite de caracteres configurável)
- Toggle: Permitir envio de imagens
- Toggle: Permitir envio de vídeos
- Toggle: Permitir envio de documentos

#### Aba 7: Handoff Humano
- Toggle: Ativar detecção de handoff humano
- Explicação: "Quando o atendente humano enviar uma mensagem pelo WhatsApp conectado, o bot pausa automaticamente"
- Campo: **Comando de reativação do bot** (ex: `#bot`, `#retomar`, `#agente`) — o atendente digita esse comando para o bot reassumir
- Campo: **Minutos de pausa** (tempo que o bot fica pausado mesmo sem o atendente enviar mais nada) — usa `chatbot_stopMinutes` na UazAPI
- Campo: **Telefone/Grupo de notificação** (para onde enviar alerta quando humano precisar assumir)

#### Aba 8: Escalation/Notificação
- Número ou JID de grupo para onde o agente envia pedidos e notificações importantes
- Instrução de escalation no prompt (ex: "quando o cliente fizer um pedido, envie para o grupo de pedidos")

---

## Módulo 3: Configuração do Agente de IA (`/app/agents/[id]/ai`)

### 3.1 — LLM
- **Provider**: dropdown (OpenAI / Anthropic / Google Gemini)
- **Modelo**:
  - OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`
  - Anthropic: `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5`
  - Google: `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`, `gemini-1.5-flash`
- **API Key**: input com eye toggle (criptografada no banco com `pgcrypto`)
- **Temperature**: slider 0.0–2.0
- **Max Tokens**: input numérico

### 3.2 — System Prompt
- Editor textarea grande com syntax highlighting básico
- Variáveis disponíveis listadas abaixo do editor: `{{customer_name}}`, `{{customer_phone}}`, `{{customer_data}}`, `{{current_date}}`, `{{current_time}}`
- Seção especial no prompt: `## Campos a salvar sobre o cliente:` — o sistema parseará essa seção para criar campos dinâmicos na tabela `customers.custom_fields`

### 3.3 — Memória
- **Memória de curto prazo**: slider 1–50 interações a manter no contexto
- **Memória de longo prazo**: toggle ativar/desativar
  - Se ativado: a cada N interações (configurável), gerar um resumo comprimido do histórico via LLM e salvar em `customers.long_term_memory`
  - Slider: "Comprimir a cada X mensagens" (10–100)

### 3.4 — Tools / Ferramentas

#### Knowledge Base (RAG)
- Lista de documentos adicionados (título, tipo, data)
- Upload de PDF, CSV ou texto livre
- Ao fazer upload: extrair texto, gerar embeddings via OpenAI `text-embedding-3-small` e salvar em `knowledge_items.embedding`
- Sync opcional com `/knowledge/edit` da UazAPI
- Configuração: número de chunks retornados na busca (top-k: 1–10)

#### Catálogo de Produtos
- CRUD de produtos: nome, descrição, preço, categoria, imagem
- Busca semântica via pgvector
- O agente recebe os produtos relevantes no contexto via RAG

#### Bucket de Arquivos (Imagens e Documentos)
- Upload de imagens e documentos para Supabase Storage
- Listagem com URL pública de cada arquivo
- O agente pode referenciar arquivos por nome e enviá-los ao cliente via `POST /send/media`

#### Calculadora
- Toggle simples — habilita tool de cálculo matemático no agente (eval seguro via mathjs)

#### Funções HTTP Customizadas
- CRUD de funções: nome, descrição, método HTTP, URL, headers, parâmetros (JSON Schema)
- O agente chama essas funções como tools do LLM (function calling)
- Sync com `/function/edit` da UazAPI

#### Número de Notificação / Grupo
- Campo para telefone ou JID de grupo
- O agente pode enviar mensagens para esse destino (pedidos, alertas, resumos) quando instruído no prompt

---

## Módulo 4: Triggers e Respostas Rápidas (`/app/agents/[id]/triggers`)

### 4.1 — Triggers
- CRUD de triggers: keyword, tipo de match (contains/exact/startsWith/regex), ação (mensagem direta / ativar agente / transferir humano)
- Sync bidirecional com `/trigger/edit` na UazAPI
- Preview de como a keyword vai disparar

### 4.2 — Quick Replies
- CRUD de respostas rápidas: atalho (ex: `/oi`) e mensagem completa
- Sync com `/quickreply/edit` na UazAPI
- Usadas tanto pelo agente quanto pelo atendente humano no inbox

---

## Módulo 5: Inbox de Conversas (`/app/agents/[id]/inbox`)

### 5.1 — Layout
- Painel esquerdo: lista de conversas com preview, nome do cliente, hora, badge de não lidas, tag de status (bot ativo / humano responsável / aguardando)
- Painel direito: conversa selecionada com histórico completo de mensagens
- Bolhas de chat diferenciadas: mensagens do cliente, do bot, do atendente humano (cores diferentes)
- Suporte visual para áudio (player), imagem (thumbnail), documento (ícone + nome), localização (mapa estático)

### 5.2 — Ações por Conversa
- Botão **"Assumir Atendimento"**: seta `customers.chatbot_disabled_until = now() + interval '24h'` e `customers.human_attendant_id = user_id` → bot para de responder → endpoint chama `POST /chat/editLead` com `chatbot_disableUntil` na UazAPI
- Botão **"Devolver ao Bot"**: reseta `chatbot_disabled_until` → bot volta a responder
- Campo de texto + botão enviar para o atendente humano responder via `POST /send/text`
- Suporte a envio de mídia pelo atendente (imagem, documento, áudio PTT)
- Dropdown de etiquetas (labels) do agente
- Botão "Bloquear contato" (`POST /chat/block`)
- Botão "Arquivar conversa" (`POST /chat/archive`)
- Ver dados do cliente (painel lateral): todos os `custom_fields`, histórico de interações, `long_term_memory`

### 5.3 — Filtros
- Por status: bot ativo / humano responsável / aguardando resposta
- Por etiqueta
- Por atendente
- Busca por nome ou telefone

### 5.4 — Realtime
- Novas mensagens aparecem em tempo real via Supabase Realtime subscriptions
- Notificação sonora (opcional, configurável) quando nova mensagem de conversa em atendimento humano

---

## Módulo 6: Engine de Processamento de Mensagens (Worker)

Este é o coração do sistema — o serviço que processa mensagens recebidas via webhook. Implementar como um serviço Node.js separado (pasta `/worker`) com BullMQ.

### 6.1 — Recebimento do Webhook (`POST /api/webhook/[agentId]`)

1. Validar que o agente existe e está ativo
2. Filtrar apenas eventos `messages` com `fromMe: false`
3. Ignorar mensagens de status (`messageType: "protocolMessage"`, `"ephemeral"`, etc.)
4. **Filtro de grupos**: se `isGroup: true`, verificar `group_mode` do agente:
   - `ignore_all`: descartar
   - `all_groups`: processar
   - `selected_groups`: verificar se o JID do grupo está em `allowed_group_jids`
5. **Verificar handoff humano**: se `fromMe: true` (mensagem enviada pelo WA conectado), verificar se é o comando de reativação do bot — se sim, resetar `chatbot_disabled_until` e retornar. Se não for o comando, pausar bot: `chatbot_disabled_until = now() + stopMinutes`
6. **Verificar `chatbot_disabled_until`**: se ainda no futuro, salvar mensagem e retornar sem processar com IA
7. Adicionar job na fila BullMQ com delay de `message_debounce_seconds` (debounce para mensagens quebradas)

### 6.2 — Processamento do Job (BullMQ Worker)

**Passo 1 — Consolidar mensagens quebradas**
- Buscar todas as mensagens do mesmo `chatid` que chegaram no janela de debounce
- Concatenar em uma única string de contexto

**Passo 2 — Resolver tipo de mídia**
- Se `messageType = "audioMessage"` e `transcribe_audio = true`: baixar áudio via `POST /message/download`, enviar para Whisper/Groq, usar transcrição como texto
- Se `messageType = "imageMessage"` e `read_images = true`: baixar imagem, converter para base64, incluir no prompt multimodal
- Se `messageType = "documentMessage"` e `read_documents = true`: baixar doc, extrair texto (pdf-parse para PDF), incluir no contexto
- Se `messageType = "locationMessage"`: formatar como "Localização: lat, lng"

**Passo 3 — Indicador de presença**
- Se `send_typing_indicator = true`: chamar `POST /message/presence` com `presence: composing`
- Se `send_read_receipt = true`: chamar `POST /chat/read` com `read: true`

**Passo 4 — Buscar/criar cliente**
- Buscar cliente por `agent_id + phone` na tabela `customers`
- Se não existir: criar registro → se `auto_add_contacts = true`, chamar `POST /contact/add`

**Passo 5 — Recuperar contexto de memória**
- Buscar últimas `short_term_memory_turns` mensagens de `memory_turns` do cliente
- Se `long_term_memory_enabled = true`: incluir `customers.long_term_memory` no system prompt
- Se knowledge base ativa: gerar embedding da mensagem atual, buscar top-k chunks relevantes via pgvector
- Se catálogo ativo: buscar produtos relevantes via pgvector

**Passo 6 — Montar e chamar LLM**
- Construir array de mensagens: `[system, ...historico, user_message]`
- Incluir tools: calculadora, funções HTTP, produto catalog, knowledge base, bucket files
- Chamar provider LLM conforme configuração (OpenAI SDK / Anthropic SDK / Google AI SDK)
- Tratar function calls em loop até resposta final

**Passo 7 — Enviar resposta**
- Se `split_messages = true`: dividir resposta por `\n\n` e enviar cada parte sequencialmente com delay entre elas
- Se recebeu áudio e `send_audio_response = true`: converter texto para áudio via ElevenLabs → upload para Supabase Storage → `POST /send/media` com `type: ptt`
- Caso contrário: `POST /send/text` com `delay` configurado
- Se resposta contém referência a arquivo do bucket: `POST /send/media`

**Passo 8 — Pós-processamento**
- Salvar mensagens do cliente e do agente em `messages`
- Atualizar `memory_turns` (manter apenas últimas N)
- Atualizar `customers.last_interaction_at`, `total_interactions`
- Incrementar `usage_logs` com tokens usados
- Incrementar `agents.total_tokens_used`, `agents.total_messages`
- Incrementar `users.tokens_used_month`, `users.messages_used_month`
- Se IA extraiu dados estruturados do cliente (conforme prompt): atualizar `customers.custom_fields`
- Se `long_term_memory_enabled` e atingiu intervalo: gerar resumo e atualizar `customers.long_term_memory`

---

## Módulo 7: Analytics e Métricas (`/app/agents/[id]/analytics`)

- Gráfico de mensagens por dia (últimos 30 dias)
- Gráfico de tokens usados por dia
- Total de clientes atendidos
- Tempo médio de resposta (calculado a partir de `messages`)
- Taxa de escalation para humano
- Top 10 clientes mais ativos
- Distribuição de tipos de mensagem recebida (texto, áudio, imagem, etc.)
- No painel admin: métricas agregadas de todos os usuários

---

## Módulo 8: Clientes (`/app/agents/[id]/customers`)

- Tabela paginada de todos os clientes do agente
- Colunas: nome, telefone, última interação, total de mensagens, status (bot/humano), custom_fields configurados
- Clique em cliente: painel de detalhes com histórico completo, memória de longo prazo, dados custom
- Editar campos custom do cliente manualmente
- Botão "Ver conversa no Inbox"
- Botão "Bloquear/Desbloquear"
- Export CSV

---

## Módulo 9: Configurações do Agente — Business Profile (`/app/agents/[id]/profile`)

- Atualizar nome do perfil WA (`POST /profile/name`)
- Atualizar foto do perfil WA (`POST /profile/image`)
- Se WhatsApp Business: editar perfil comercial (`POST /business/update/profile`): descrição, endereço, email, categoria
- Gerenciar etiquetas do agente (`POST /label/edit`, `GET /labels`)

---

## Módulo 10: Campanhas / Disparos em Massa (`/app/agents/[id]/campaigns`)

- Criar campanha: nome, mensagem (template com `{{name}}`, `{{phone}}`), tipo (text/image/video/document), delay mín/máx
- Upload de lista de contatos (CSV: telefone, nome, campos extras)
- Agendamento: imediato ou data/hora futura
- Chamar `POST /sender/advanced` com os dados
- Monitorar status: `GET /sender/listfolders` → mostrar progresso em tempo real
- Pausar/retomar/cancelar campanha: `POST /sender/edit`
- Ver detalhes de cada mensagem: `POST /sender/listmessages`

---

## Funcionalidades Importantes que Você Não Mencionou (Incluir Obrigatoriamente)

### ⚠️ QR Code e Reconexão Automática
Sem isso o sistema não funciona. Implementar polling no status da instância e exibir QR code em modal com auto-refresh a cada 20 segundos. Quando desconectar, enviar notificação interna e tentar reconexão automática com backoff exponencial (3 tentativas com 30s, 60s, 120s de intervalo).

### ⚠️ Criptografia de API Keys
Todas as chaves de API (LLM, ElevenLabs) devem ser criptografadas em repouso com `pgcrypto` (`encrypt(key, app_secret, 'aes')`) e descriptografadas apenas no worker no momento do uso. **Nunca retornar as chaves descriptografadas no frontend.**

### ⚠️ Rate Limiting e Quota
- Middleware que bloqueia processamento de mensagens quando `users.messages_used_month >= plan.max_messages_month`
- Resposta automática ao cliente quando quota atingida: "Serviço temporariamente indisponível"
- Email de alerta ao usuário quando atingir 80% da quota

### ⚠️ Blacklist por Agente
- No cadastro de clientes: toggle "Bloquear este contato"
- Webhook verifica blacklist antes de processar
- Opção de blacklist global (todos os agentes do usuário)

### ⚠️ SSE para QR Code em Tempo Real
Usar `GET /sse` da UazAPI (Server-Sent Events) para receber o QR code e status de conexão em tempo real durante o processo de pareamento, em vez de polling.

### ⚠️ Variáveis de Ambiente
Criar `.env.example` completo com todas as variáveis necessárias:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UAZAPI_DEFAULT_URL=https://free.uazapi.com
UAZAPI_ADMIN_TOKEN=
REDIS_URL=redis://localhost:6379
ENCRYPTION_SECRET=
NEXTAUTH_SECRET=
APP_URL=http://localhost:3000
ELEVENLABS_API_KEY= (opcional, pode ser por agente)
OPENAI_API_KEY= (opcional, pode ser por agente)
```

### ⚠️ docker-compose.yml
Incluir `docker-compose.yml` para subir o ambiente completo:
- App Next.js
- Worker Node.js
- Redis (para BullMQ)
- Supabase local (via `supabase/docker`) OU instruções para usar Supabase cloud

---

## Considerações de Segurança

1. **Validação de webhook**: verificar que a requisição ao endpoint de webhook vem de um IP confiável ou inclui um token secreto na URL (`/api/webhook/[agentId]?secret=[webhookSecret]`), gerado no momento de criação do agente
2. **RLS no Supabase**: todas as tabelas devem ter políticas RLS para que usuários só vejam seus próprios dados
3. **Validação de quota**: verificar no servidor (nunca confiar no frontend) se o usuário pode criar mais agentes ou processar mais mensagens
4. **Sanitização de prompts**: sanitizar entradas do usuário antes de incluir no system prompt para evitar prompt injection
5. **CORS**: configurar apenas origens permitidas nas API routes

---

## Estrutura de Pastas do Projeto

```
/
├── app/                          # Next.js App Router
│   ├── (auth)/login, register    # Páginas de autenticação
│   ├── app/
│   │   ├── admin/               # Painel administrativo
│   │   ├── agents/              # Listagem de agentes
│   │   │   └── [id]/
│   │   │       ├── page.tsx     # Visão geral
│   │   │       ├── ai/          # Config LLM e tools
│   │   │       ├── inbox/       # Caixa de entrada
│   │   │       ├── customers/   # Clientes
│   │   │       ├── triggers/    # Triggers e quick replies
│   │   │       ├── campaigns/   # Disparos em massa
│   │   │       ├── analytics/   # Métricas
│   │   │       └── profile/     # Perfil WA Business
│   │   └── settings/            # Configurações do usuário
│   └── api/
│       ├── webhook/[agentId]/   # Endpoint que recebe eventos da UazAPI
│       ├── agents/              # CRUD de agentes
│       ├── uazapi/              # Proxy para UazAPI (QR, status, etc.)
│       └── ...
├── worker/                      # Serviço BullMQ separado
│   ├── index.ts                 # Inicialização das filas
│   ├── processors/
│   │   ├── message.processor.ts # Lógica principal de processamento
│   │   ├── media.processor.ts   # Download e processamento de mídia
│   │   └── memory.processor.ts  # Gestão de memória e embeddings
│   └── services/
│       ├── llm.service.ts       # Abstração multi-provider LLM
│       ├── tts.service.ts       # ElevenLabs TTS
│       ├── stt.service.ts       # Whisper STT
│       └── uazapi.service.ts    # Client da UazAPI
├── lib/
│   ├── supabase/                # Clients Supabase (server/client/admin)
│   ├── uazapi/                  # SDK wrapper da UazAPI
│   └── crypto.ts                # Criptografia de API keys
├── supabase/
│   └── migrations/              # Migrations SQL completas
├── docker-compose.yml
└── .env.example
```

---

## Ordem de Desenvolvimento Recomendada

1. Setup do projeto (Next.js + Supabase + Redis + Docker)
2. Migrations do banco de dados com todas as tabelas e RLS
3. Autenticação e middleware de proteção de rotas
4. CRUD de agentes com integração UazAPI (init, webhook, chatbotsettings)
5. Tela de conexão WhatsApp com QR Code (SSE/polling)
6. Engine de processamento de mensagens (worker) — versão básica texto→texto
7. Inbox de conversas com Realtime
8. Configuração de LLM e system prompt
9. Sistema de memória (short-term e long-term)
10. Knowledge base com RAG (pgvector)
11. Catálogo de produtos
12. Tools: calculadora, funções HTTP, bucket de arquivos
13. Handoff humano (detecção + reativação por comando)
14. Processamento de mídia (áudio transcrição + resposta em áudio ElevenLabs)
15. Analytics e métricas
16. Painel admin com gestão de usuários e planos
17. Campanhas/disparos em massa
18. Triggers e quick replies
19. Notificações e sistema de quota/alertas
20. Testes end-to-end e hardening de segurança

---

## Notas Finais da UazAPI

- **Header de autenticação**: endpoints normais usam `token` (da instância), criação/deleção de instâncias usa `admintoken`
- **Formato de número**: sempre `DDI+DDD+número` sem `+` ou espaços (ex: `5511999999999`); grupos sempre terminam em `@g.us`
- **Delay nas mensagens**: usar `delay` em milissegundos no `POST /send/text` para simular digitação humana (recomendado 1000–3000ms)
- **`chatbot_stopWhenYouSendMsg`**: configurar na UazAPI para pausar automaticamente quando o próprio número envia uma mensagem (handoff humano)
- **Webhook events**: registrar os eventos `messages`, `connection`, `send`, `presence` no webhook de cada instância
- **`addUrlEvents: true`** no webhook: adiciona o tipo do evento à URL, facilitando roteamento no backend
