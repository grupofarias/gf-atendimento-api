# Data Model: Core Middleware de Atendimento

**Feature**: 001-core-middleware | **Date**: 2026-05-02
**DB**: PostgreSQL 16 + pgvector (embedded Docker)

Convencoes de tipos PostgreSQL:
- PKs: `SERIAL` (INTEGER auto-increment)
- Timestamps: `TIMESTAMPTZ` (com fuso)
- Booleanos: `BOOLEAN` (nao TINYINT)
- Enums: tipo PostgreSQL nativo (TypeORM `@Column({ type: 'enum', enum: [...] })`)
- `updated_at`: gerenciado pelo TypeORM `@UpdateDateColumn()`, sem trigger SQL

---

## Entidades e Schema

### chatwoot_accounts

Credenciais e URL base de uma conta Chatwoot. Suporta N contas sem restart.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| account_id | INTEGER | NOT NULL UNIQUE | ID da conta no Chatwoot |
| base_url | VARCHAR(255) | NOT NULL | Ex: https://chatwootpainel.infragf.com.br |
| api_token | TEXT | NOT NULL | Criptografado com APP_SECRET (AES-256-GCM) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### evolution_instances

Credenciais de instancias Evolution API (WhatsApp gateway).

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| instance_name | VARCHAR(100) | NOT NULL UNIQUE | Nome da instancia no Evolution |
| base_url | VARCHAR(255) | NOT NULL | Ex: https://evolutionv2.infragf.com.br |
| api_key | TEXT | NOT NULL | Criptografado com APP_SECRET |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### bots

Configuracao de um processador de IA (n8n ou Botpress) para um grupo de inboxes.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| code | VARCHAR(50) | NOT NULL UNIQUE | Identificador curto, ex: 'atendimento-geral' |
| processor | VARCHAR(20) | NOT NULL CHECK IN ('n8n','botpress') | |
| webhook_url | VARCHAR(500) | NOT NULL | URL do n8n ou Botpress para receber InternalMessage |
| webhook_secret | VARCHAR(255) | NULL | Segredo para HMAC do header X-Webhook-Secret |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### inbox_config

Mapeamento de inbox Chatwoot para conta, instancia Evolution e bot.
Uma inbox pertence a exatamente um bot; um bot pode ter N inboxes.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| chatwoot_inbox_id | INTEGER | NOT NULL UNIQUE | ID da inbox no Chatwoot |
| account_id | INTEGER | NOT NULL FK → chatwoot_accounts.account_id | |
| evolution_instance_id | INTEGER | NULL FK → evolution_instances.id | NULL se inbox nao for WhatsApp |
| bot_id | INTEGER | NOT NULL FK → bots.id | |
| channel_type | VARCHAR(20) | NOT NULL CHECK IN ('whatsapp','webchat','instagram','facebook','api') | |
| active | BOOLEAN | NOT NULL DEFAULT TRUE | Desativa sem deletar |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Index**: `(account_id, chatwoot_inbox_id)`

---

### contacts

Identificacao de contatos por telefone normalizado (E.164).
Multi-tenant: mesmo numero pode existir em contas Chatwoot distintas — UNIQUE e por conta.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| chatwoot_account_id | INTEGER | NOT NULL FK → chatwoot_accounts.account_id | Conta a qual este contato pertence |
| phone | VARCHAR(20) | NOT NULL | Formato E.164 ex: +5511999998888 |
| chatwoot_contact_id | INTEGER | NULL | ID do contato no Chatwoot |
| name | VARCHAR(255) | NULL | Nome do contato (opcional) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Constraint**: UNIQUE `(chatwoot_account_id, phone)` — mesmo numero em contas diferentes e registros distintos
**Index**: `(chatwoot_account_id, phone)` — busca frequente por conta + telefone

---

### conversations

Estado local de uma conversa. `bot_active` e a fonte de verdade para roteamento.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| chatwoot_conversation_id | INTEGER | NOT NULL UNIQUE | ID da conversa no Chatwoot |
| inbox_id | INTEGER | NOT NULL FK → inbox_config.chatwoot_inbox_id | |
| contact_id | INTEGER | NOT NULL FK → contacts.id | |
| bot_active | BOOLEAN | NOT NULL DEFAULT TRUE | FALSE = humano assumiu |
| status | VARCHAR(20) | NOT NULL DEFAULT 'open' CHECK IN ('open','pending','resolved','snoozed') | Espelha Chatwoot |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Index**: `(chatwoot_conversation_id)`, `(inbox_id, contact_id)`

---

### handoff_log

Registro auditavel de cada transferencia bot->humano.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| conversation_id | INTEGER | NOT NULL FK → conversations.id | |
| triggered_by | VARCHAR(30) | NOT NULL CHECK IN ('n8n','chatwoot_assignee') | Origem do handoff |
| team_id | INTEGER | NULL | Time Chatwoot atribuido |
| agent_id | INTEGER | NULL | Agente Chatwoot atribuido |
| reason | TEXT | NULL | Motivo informado pelo n8n |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### outbox

Fila duravel de encaminhamentos pendentes ao n8n. Garante entrega mesmo se middleware reiniciar
apos retornar 200 ao Chatwoot mas antes de completar o POST ao n8n.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| conversation_id | INTEGER | NOT NULL FK → conversations.id | |
| payload | JSONB | NOT NULL | InternalMessage serializada |
| webhook_url | VARCHAR(500) | NOT NULL | URL do n8n alvo (snapshot no momento do INSERT) |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' CHECK IN ('pending','sent','failed') | |
| attempts | SMALLINT | NOT NULL DEFAULT 0 | Tentativas realizadas |
| last_error | TEXT | NULL | Ultimo erro registrado |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| sent_at | TIMESTAMPTZ | NULL | Preenchido apos entrega bem-sucedida |

**Index**: `(status, created_at)` — recovery job busca `WHERE status='pending' ORDER BY created_at`
**Purge**: registros `status='sent'` com `sent_at < NOW() - INTERVAL '48 hours'` — cron diario junto ao purge de processed_events
**Recovery**: job de startup varre `status='pending'` com `created_at < NOW() - INTERVAL '30 seconds'` e retenta

---

### processed_events

Registro de dedup por (source, external_id). TTL de 48 horas.
UNIQUE constraint garante atomicidade mesmo com multiplas replicas.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | SERIAL | PK | |
| source | VARCHAR(50) | NOT NULL | Ex: 'chatwoot' |
| external_id | VARCHAR(255) | NOT NULL | Ex: message.id do webhook |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Constraint**: UNIQUE `(source, external_id)`
**Index**: `(created_at)` — para purge eficiente (DELETE WHERE created_at < NOW() - INTERVAL '48 hours')
**Purge**: cron diario

---

## Extensao pgvector (futura — RAG)

Quando RAG for implementado, habilitar via migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Exemplo de coluna em futura tabela `knowledge_embeddings`:

```sql
embedding vector(1536)  -- dimensao depende do modelo (OpenAI=1536, nomic=768)
```

Nenhuma tabela atual usa pgvector — reservado para features futuras.

---

## Tipo de Dominio: InternalMessage

Nao e uma entidade persistida. Contrato entre o domain normalizer e os consumers (n8n, Botpress).

```typescript
type ContentType =
  | 'text' | 'image' | 'audio' | 'video' | 'file'
  | 'sticker' | 'location' | 'contact_card'
  | 'ad' | 'view_once' | 'reaction' | 'poll' | 'unsupported';

type ChannelType = 'whatsapp' | 'webchat' | 'instagram' | 'facebook' | 'api';

interface MediaInfo {
  url: string;          // '' para view_once (NUNCA a URL real)
  mimeType: string;
  filename?: string;
  size?: number;        // bytes
  duration?: number;    // segundos, apenas audio/video
  caption?: string;
  viewOnce: boolean;
}

interface InternalMessage {
  messageId: string;
  conversationId: number;
  contactId: number;
  phone: string;          // E.164
  inboxId: number;
  channelType: ChannelType;
  contentType: ContentType;
  botCode: string;        // bots.code do inbox
  text?: string;
  media?: MediaInfo;
  location?: { latitude: number; longitude: number; label?: string };
  contactCard?: { name: string; phone: string };
  adContext?: { title: string; sourceUrl: string };
  reaction?: { emoji: string; targetMessageId: string };
  timestamp: number;      // Unix ms
}
```

---

## Diagrama de Relacionamentos

```
chatwoot_accounts (1) ──< inbox_config (N)
chatwoot_accounts (1) ──< contacts (N)       ← multi-tenant: UNIQUE por (account_id, phone)
evolution_instances (1) ──< inbox_config (N)
bots (1) ──< inbox_config (N)

contacts (1) ──< conversations (N)
inbox_config (1) ──< conversations (N)
conversations (1) ──< handoff_log (N)
conversations (1) ──< outbox (N)
```

---

## Notas de Migracao

- Todas as mudancas de schema via migration TypeORM (`npm run migration:generate -- NomeMigration`).
- `synchronize: false` em TODOS os ambientes — incluindo desenvolvimento.
- Primeira migration: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` (opcional) + todas as tabelas.
- Seed inicial: INSERT em `chatwoot_accounts`, `evolution_instances`, `bots`, `inbox_config` para
  a conta e inbox existente (chatwootpainel.infragf.com.br, account_id=1).
- Index em `processed_events.created_at` criado na migration de criacao da tabela.
- TypeORM PostgreSQL driver: pacote `pg` (nao `mysql2`).
