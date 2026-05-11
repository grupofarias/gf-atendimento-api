# Plano: Middleware de Atendimento Grupo Farias

**Data:** 2026-05-02  
**Repo base:** grupofarias/whatsappBot  
**Stack:** NestJS + TypeScript, MySQL (TypeORM), Docker Swarm

---

## Decisões arquiteturais

| Decisão | Escolha | Motivo |
|---|---|---|
| Quem recebe webhook Chatwoot | Middleware | Normaliza, deduplica, resolve mídia antes do n8n |
| Quem orquestra IA | n8n | Analistas trabalham sem código |
| Debounce de mensagens | n8n (já existe, Redis 5-8s) | Não mexer no que funciona |
| Storage de mídia | MinIO existente | Chatwoot já usa `s3minio.infragf.com.br/chatwoot` |
| Credenciais por conta | Banco de dados | Suporta N contas Chatwoot + N instâncias Evolution |
| Sessão por canal | Isolada por inbox | Merge de identidade = responsabilidade humana no Chatwoot |

---

## Arquitetura

```
WhatsApp → Evolution API → Chatwoot
  (webchat, instagram, facebook também)
                               │
                    webhook POST /webhook/chatwoot
                               │
                          [Middleware]
                               │
                    1. identifica conta (account_id → chatwoot_accounts)
                    2. dedup (message.id → processed_events)
                    3. normaliza → InternalMessage
                    4. resolve mídia:
                       URL Active Storage → segue redirect → URL MinIO direta
                       (arquivo já está no MinIO, Chatwoot usa s3minio.infragf.com.br)
                    5. view_once: media.url = '' (nunca propagar)
                               │
                    POST webhook do n8n (InternalMessage limpa)
                               │
                              n8n                    ← analistas configuram aqui
                               │ debounce Redis (já existe, 5-8s)
                               │ IA: LangChain / OpenAI / Botpress
                               │
                    chama endpoints do middleware:
                    ├─ POST /conversations/:id/messages   (envia resposta)
                    ├─ POST /conversations/:id/handoff    (transfere setor/agente)
                    ├─ GET  /conversations/:id            (estado atual)
                    └─ POST /contacts/upsert              (garante contato)
                               │
                          [Middleware]
                               │
                          Chatwoot API → Evolution → WhatsApp
```

---

## .env — Variáveis necessárias

```env
# Banco de dados
DATABASE_HOST=
DATABASE_PORT=3306
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_NAME=

# MinIO (storage compartilhado com Chatwoot)
MINIO_ENDPOINT=https://s3minio.infragf.com.br
MINIO_ACCESS_KEY=             # credencial de leitura do bucket chatwoot
MINIO_SECRET_KEY=
MINIO_BUCKET=chatwoot         # mesmo bucket do Chatwoot

# Segurança
APP_SECRET=                   # chave para criptografar tokens no banco
PORT=3200

# n8n — webhook de destino (onde middleware entrega InternalMessage)
N8N_WEBHOOK_URL=              # URL do workflow n8n que recebe mensagens normalizadas
N8N_WEBHOOK_SECRET=           # header de autenticação para o n8n
```

**Credenciais de Chatwoot e Evolution ficam no banco** (tabelas `chatwoot_accounts` e `evolution_instances`), não no `.env`. Isso permite N contas sem restart da aplicação.

---

## Schema do banco

```sql
-- Contas Chatwoot (N contas suportadas)
CREATE TABLE chatwoot_accounts (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  account_id  INT NOT NULL UNIQUE,
  base_url    VARCHAR(500) NOT NULL,
  api_token   VARCHAR(500) NOT NULL,   -- criptografado com APP_SECRET
  active      BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT NOW()
);

-- Instâncias Evolution (N instâncias suportadas)
CREATE TABLE evolution_instances (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL UNIQUE,
  base_url    VARCHAR(500) NOT NULL,
  api_key     VARCHAR(500) NOT NULL,   -- criptografado com APP_SECRET
  active      BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT NOW()
);

-- Configuração por inbox: qual conta Chatwoot, qual Evolution, qual bot
CREATE TABLE inbox_config (
  inbox_id              INT PRIMARY KEY,    -- Chatwoot inbox.id
  chatwoot_account_id   INT NOT NULL,       -- FK chatwoot_accounts
  evolution_instance_id INT,                -- FK evolution_instances (null se não WhatsApp)
  channel_type          VARCHAR(50) NOT NULL, -- 'whatsapp','webchat','instagram','facebook','api'
  bot_code              VARCHAR(100) NOT NULL, -- FK bots.code
  n8n_webhook_url       VARCHAR(500),       -- override por inbox (opcional)
  active                BOOLEAN DEFAULT TRUE
);

-- Bots: unidade de configuração do processador de IA
-- N inboxes podem referenciar o mesmo bot
CREATE TABLE bots (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(100) NOT NULL UNIQUE,
  processor     ENUM('n8n','botpress') NOT NULL DEFAULT 'n8n',
  processor_url VARCHAR(500) NOT NULL,
  bot_id        VARCHAR(100),               -- ID interno do engine
  capabilities  JSON,
  -- ex: {"audio":"stt","image":"vision","view_once":"notify","unsupported":"fallback"}
  active        BOOLEAN DEFAULT TRUE
);

-- Contatos
CREATE TABLE contacts (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  chatwoot_id INT NOT NULL UNIQUE,
  phone       VARCHAR(20) NOT NULL UNIQUE,  -- E.164 obrigatório: +55XXXXXXXXXXX
  name        VARCHAR(200),
  created_at  DATETIME DEFAULT NOW()
);

-- Conversas: estado local (bot_active gerenciado aqui — toggle_status bot quebrado no Chatwoot)
CREATE TABLE conversations (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  chatwoot_id INT NOT NULL UNIQUE,
  inbox_id    INT NOT NULL,
  contact_id  INT NOT NULL,
  bot_active  BOOLEAN DEFAULT TRUE,
  status      ENUM('open','pending','resolved') DEFAULT 'open',
  created_at  DATETIME DEFAULT NOW(),
  updated_at  DATETIME DEFAULT NOW() ON UPDATE NOW()
);

-- Dedup de eventos (idempotência)
CREATE TABLE processed_events (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  source       VARCHAR(50) NOT NULL,
  external_id  VARCHAR(100) NOT NULL,
  processed_at DATETIME DEFAULT NOW(),
  UNIQUE KEY uq_source_ext (source, external_id),
  INDEX idx_processed_at (processed_at)     -- para purga diária
);
-- job diário: DELETE WHERE processed_at < NOW() - INTERVAL 48 HOUR

-- Audit log de handoffs
CREATE TABLE handoff_log (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  conversation_id INT NOT NULL,
  from_bot        VARCHAR(100),
  to_team_id      INT,
  to_agent_id     INT,
  reason          VARCHAR(500),
  created_at      DATETIME DEFAULT NOW()
);
```

---

## InternalMessage (entregue ao n8n)

```typescript
type ContentType =
  | 'text' | 'image' | 'audio' | 'video' | 'file'
  | 'sticker' | 'location' | 'contact_card'
  | 'ad' | 'view_once' | 'reaction' | 'poll' | 'unsupported';

type ChannelType = 'whatsapp' | 'webchat' | 'instagram' | 'facebook' | 'api';

interface InternalMessage {
  messageId:      string;
  conversationId: number;
  contactId:      number;
  phone:          string;          // E.164
  inboxId:        number;
  channelType:    ChannelType;
  contentType:    ContentType;
  botCode:        string;          // bot configurado para este inbox

  text?:    string;

  media?: {
    url:       string;             // URL MinIO direta ('' se view_once)
    mimeType:  string;
    filename?: string;
    size?:     number;
    duration?: number;             // segundos (audio/video)
    caption?:  string;
    viewOnce:  boolean;
  };

  location?:    { lat: number; lng: number; name?: string; address?: string };
  contactCard?: { name: string; phones: string[] };
  adContext?:   { title: string; sourceUrl: string };
  reaction?:    { emoji: string; targetMessageId: string };

  timestamp: number;
}
```

**Resolução de mídia:**
```
Chatwoot webhook inclui URL Active Storage:
  https://chatwootpainel.infragf.com.br/rails/active_storage/blobs/redirect/{TOKEN}/arquivo.jpg

Middleware faz GET com api_access_token → segue redirect → URL final MinIO:
  https://s3minio.infragf.com.br/chatwoot/{path}/arquivo.jpg

InternalMessage.media.url = URL MinIO direta
n8n recebe URL estável sem auth — arquivo já estava no MinIO
Zero duplicação (Chatwoot já usa s3minio.infragf.com.br/chatwoot)
```

---

## Endpoints REST do Middleware

### Webhook (entrada)
```
POST /webhook/chatwoot
  → recebe webhook do Chatwoot
  → identifica conta, deduplica, normaliza, resolve mídia
  → POST para n8n com InternalMessage
  → retorna 200 imediatamente (assíncrono)
```

### Dedup
```
POST /api/v1/events
Body: { source, externalId }
Resp: { seen: boolean }
```

### Contatos
```
GET  /api/v1/contacts/:phone          → busca por telefone (E.164)
POST /api/v1/contacts/upsert
Body: { phone, name?, inboxId }
Resp: { chatwootId, localId, phone }
```

### Conversas
```
GET   /api/v1/conversations/:chatwootId
PATCH /api/v1/conversations/:chatwootId
Body: { botActive?, status? }

POST  /api/v1/conversations/:chatwootId/handoff
Body: { teamId?, agentId?, reason? }
→ PATCH Chatwoot status:pending + assign + handoff_log + bot_active=false

POST  /api/v1/conversations/:chatwootId/bot/activate
POST  /api/v1/conversations/:chatwootId/bot/deactivate
```

### Mensagens
```
POST /api/v1/conversations/:chatwootId/messages
Body: { content, contentType, mediaUrl?, private? }
→ chama Chatwoot API com credenciais da conta correta
```

### Filas e métricas
```
GET /api/v1/queue?teamId=&status=
GET /api/v1/metrics?from=&to=
GET /health
```

---

## Infraestrutura Chatwoot confirmada

| Recurso | Valor | Detalhe |
|---|---|---|
| URL | chatwootpainel.infragf.com.br | |
| Account ID | 1 | Grupo Farias |
| Storage | s3_compatible | s3minio.infragf.com.br, bucket: chatwoot |
| Inbox WhatsApp teste | 4 | Channel::Api → evolutionv2.infragf.com.br |
| Team comercial | 1 | membros: COMERCIAL(7), lucas(4), GF(1) |
| Agentes | 5 | COMERCIAL(7), GF(1), Kaio(6), lucas(4) |

Endpoints Chatwoot confirmados via API:
- `POST /conversations/:id/messages` ✅
- `POST /conversations/:id/assignments` (team_id / assignee_id) ✅
- `PATCH /conversations/:id` (status) ✅
- `GET /contacts/search?q=` ✅
- `POST /contacts` + `POST /contacts/:id/contact_inboxes` ✅
- `toggle_status bot` ❌ 500 → `bot_active` gerenciado no DB local

---

## O que remover (legado JetSales)

| Arquivo | Motivo |
|---|---|
| `src/ticket/` | URL hardcoded `chat-82api.jetsalesbrasil.com` |
| `src/webhook/` | Substituído pelo novo WebhookModule |
| `src/queue/` | RabbitMQ desnecessário — n8n é a fila |
| `src/processor/processor.service.ts` | Duplicata — bug de double-processing |
| `src/bot/bot.service.ts` `sendReply()` | Substituído por `/messages` endpoint |
| `JETGO_API_TOKEN` no .env | Credencial JetSales |

Manter: `src/access/`, `src/entities/`, `src/bot/bot.service.ts` `askBotpress()` (opcional)

---

## Fases de implementação

### Fase 0 — Limpeza e base (2 dias)
- [ ] Remover: `ticket`, `queue`, `ProcessorService`, `sendReply`
- [ ] Migrations: todas as tabelas do schema acima
- [ ] `GET /health`
- [ ] Configurar `.env` com variáveis listadas acima
- [ ] Popular `chatwoot_accounts`, `evolution_instances`, `inbox_config`, `bots` com dados iniciais

### Fase 1 — Webhook receiver + Normalizer (3 dias)
- [ ] `POST /webhook/chatwoot` — recebe, identifica conta, retorna 200 imediato
- [ ] Dedup por `message.id`
- [ ] Normalizer: WebhookPayload → InternalMessage (todos ContentTypes)
- [ ] Filtros: `sender.type === 'contact'`, `private !== true`, `bot_active`
- [ ] Evento `conversation_updated/assigned` → `bot_active=false`
- [ ] Evento `conversation_status_changed` (reaberta) → avaliar reset `bot_active`
- [ ] Resolução de mídia: Active Storage redirect → URL MinIO
- [ ] `view_once`: `media.url = ''`
- [ ] POST para n8n com InternalMessage

### Fase 2 — Contatos + Conversas + Dedup (2 dias)
- [ ] `POST /api/v1/contacts/upsert` com `normalizeToE164()`
- [ ] `GET/PATCH /api/v1/conversations/:id`
- [ ] `POST /api/v1/conversations/:id/bot/activate|deactivate`
- [ ] `POST /api/v1/events` (dedup explícito para n8n)
- [ ] Job de purga `processed_events` (48h)

### Fase 3 — Mensagens + Handoff (2 dias)
- [ ] `POST /api/v1/conversations/:id/messages` → Chatwoot API (com credenciais do banco)
- [ ] `POST /api/v1/conversations/:id/handoff` → assign + audit log
- [ ] Atualizar workflows n8n para chamar middleware

### Fase 4 — Migração inbox a inbox (2 dias)
- [ ] Inbox de homologação primeiro
- [ ] Smoke test: webhook → dedup → normaliza → n8n recebe → responde → handoff
- [ ] Migrar inboxes produção um a um
- [ ] Remover chamadas JetSales dos workflows após cada inbox migrado

### Fase 5 — Fila, métricas e MCP (futuro)
- [ ] `GET /api/v1/queue`, `GET /api/v1/metrics`
- [ ] MCP Server: expor endpoints como tools para agentes autônomos

---

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| `bot_active` não desliga quando humano assume via UI | Crítico | Processar `conversation_updated/assigned` no webhook |
| Mensagens `outgoing`/`private` processadas como input | Crítico | Filtro `sender.type` + `private !== true` |
| Race condition em `upsertConversation` | Crítico | Redis lock `{inboxId}:{phone}` TTL=15s |
| JetSales e middleware no mesmo inbox simultaneamente | Crítico | Rollout inbox a inbox, nunca paralelo |
| `toggle_status bot` retorna 500 | Alto | `bot_active` gerenciado no DB |
| Conversa reaberta após resolução fica sem bot | Alto | Tratar `conversation_status_changed` |
| `processed_events` sem TTL | Médio | Job de purga 48h |
| Normalização de telefone inconsistente | Médio | `normalizeToE164()` obrigatório |
| Dois servidores n8n com webhooks distintos | Médio | Confirmar manualmente no Chatwoot antes de migrar |
| Bug JID legacy Evolution API em grupos | Baixo | Encapsular no adapter, nunca expor JID raw |

---

## Nomenclatura

- ERP: ERP Senior (nunca "Oracle ERP Senior" ou só "Senior")
- Kaio (nunca Caio)
- Tabelas/colunas: snake_case inglês
- Sem em dash ou en dash
