# Contract: REST API do Middleware

**Version**: 2.0 | **Date**: 2026-05-11

Todos os endpoints requerem autenticação via header `X-Api-Key` (valor = `MIDDLEWARE_API_KEY` do .env).

## Base URL

```
https://apigf.loclx.io          (desenvolvimento via LocalXpose)
http://gf-atendimento-api:3200   (interno Docker Swarm / produção)
```

---

## POST /normalize

Normaliza um payload bruto do Chatwoot. Chamado pelo n8n imediatamente ao receber o webhook do Chatwoot.
Executa: dedup por `messageId` (Redis) → normalização → resolução de URL de mídia (MinIO) → upsert contact/conversation local.

O n8n decide o que fazer com o resultado baseado nos campos `event`, `messageType`, `isPrivate`, `senderType`, `labels`.

### Request

```http
POST /normalize
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ ...payload bruto do Chatwoot... }
```

No n8n, o body deve ser `{{ $json.body }}` (apenas o corpo do webhook, sem headers/executionMode).

### Response 200 — skip

```json
{ "skip": true, "reason": "duplicate" }
```

| reason | Causa |
|--------|-------|
| `inbox_not_found` | Inbox não configurada no middleware |
| `duplicate` | Mesmo `messageId` já processado |
| `group_message` | JID de grupo WhatsApp (`@g.us`) |

### Response 200 — mensagem normalizada

```json
{
  "skip": false,
  "message": {
    "event": "message_created",
    "messageId": "395",
    "conversationId": 14,
    "contactId": 1,
    "phone": "+5511933030497",
    "inboxId": 5,
    "channelType": "whatsapp",
    "contentType": "text",
    "botCode": "n8n-main",
    "messageType": "incoming",
    "isPrivate": false,
    "senderType": "contact",
    "labels": ["tagteste"],
    "text": "Ola",
    "timestamp": 1746144000000
  }
}
```

#### Campos de roteamento no n8n

| Campo | Valores | Uso |
|-------|---------|-----|
| `event` | `message_created`, `conversation_updated`, ... | tipo do evento Chatwoot |
| `messageType` | `incoming`, `outgoing`, `activity` | direção da mensagem |
| `isPrivate` | `true`/`false` | nota interna vs mensagem para cliente |
| `senderType` | `contact`, `agent`, `user`, undefined | quem enviou |
| `labels` | `string[]` | tags atuais da conversa no Chatwoot |

#### Campos de mídia (quando `contentType` ≠ `text`)

```json
{
  "contentType": "image",
  "media": {
    "url": "https://s3minio.infragf.com.br/chatwoot/...",
    "mimeType": "image/jpeg",
    "size": 176953,
    "viewOnce": false
  }
}
```

`media.url` sempre MinIO (redirect resolvido). `view_once`: `url: ""` invariável.

---

## POST /conversations/:id/messages

Envia mensagem ao cliente via Chatwoot.

### Request

```http
POST /conversations/14/messages
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}
Idempotency-Key: {uuid-v4}

{
  "content": "Ola! Como posso ajudar?",
  "private": false
}
```

`Idempotency-Key` (recomendado): mesma chave dentro de 5 min retorna resposta cacheada sem reenviar.

### Response 200

```json
{ "messageId": "chatwoot-msg-id-123", "status": "sent" }
```

---

## POST /conversations/:id/handoff

Transferência bot→humano: status `pending` no Chatwoot, atribui time/agente, registra handoff_log, seta `bot_active=false`.

### Request

```http
POST /conversations/14/handoff
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{
  "teamId": 1,
  "agentId": null,
  "reason": "Cliente solicitou falar com humano"
}
```

*Ao menos um de `teamId` ou `agentId` obrigatório.*

### Response 200

```json
{ "status": "ok", "botActive": false, "conversationStatus": "pending" }
```

---

## PATCH /conversations/:id/status

Muda status da conversa no Chatwoot e atualiza localmente.

### Request

```http
PATCH /conversations/14/status
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ "status": "open" }
```

`status`: `open` | `pending` | `resolved` | `snoozed`

### Response 200

```json
{ "status": "ok" }
```

---

## POST /conversations/:id/labels

Adiciona labels à conversa no Chatwoot.

### Request

```http
POST /conversations/14/labels
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ "labels": ["vip", "urgente"] }
```

### Response 200

```json
{ "status": "ok" }
```

---

## DELETE /conversations/:id/labels

Remove labels da conversa (mantém as demais).

### Request

```http
DELETE /conversations/14/labels
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ "labels": ["urgente"] }
```

### Response 200

```json
{ "status": "ok" }
```

---

## GET /conversations/:id/agents

Lista agentes do Chatwoot para a conta associada à conversa.

### Request

```http
GET /conversations/14/agents?q=Ana
X-Api-Key: {MIDDLEWARE_API_KEY}
```

`q` (opcional): filtro por nome.

### Response 200

```json
[
  { "id": 3, "name": "Ana Lima", "email": "ana@grupofarias.com.br" }
]
```

---

## GET /conversations/:id/teams

Lista equipes do Chatwoot para a conta associada à conversa.

### Request

```http
GET /conversations/14/teams
X-Api-Key: {MIDDLEWARE_API_KEY}
```

### Response 200

```json
[
  { "id": 1, "name": "Suporte" },
  { "id": 2, "name": "Vendas" }
]
```

---

## POST /events/conversation-updated

Sincroniza estado local quando agente assume conversa no Chatwoot.
Chamado pelo n8n ao receber evento `conversation_updated` do Chatwoot.

### Request

```http
POST /events/conversation-updated
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ "conversationId": 14, "hasAssignee": true }
```

`hasAssignee: true` → seta `bot_active=false` no banco local.

### Response 200

```json
{ "status": "ok" }
```

---

## POST /events/conversation-status-changed

Sincroniza status local.
Chamado pelo n8n ao receber evento `conversation_status_changed` do Chatwoot.

### Request

```http
POST /events/conversation-status-changed
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{ "conversationId": 14, "status": "open" }
```

`status: "open"` → seta `bot_active=true`. Demais status: só atualiza status local.

### Response 200

```json
{ "status": "ok" }
```

---

## GET /health

```http
GET /health
```

### Response 200

```json
{ "status": "ok" }
```
