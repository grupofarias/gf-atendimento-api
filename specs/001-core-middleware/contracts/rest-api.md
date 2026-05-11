# Contract: REST API do Middleware

**Version**: 1.0 | **Date**: 2026-05-02

Endpoints expostos pelo middleware para o n8n chamar apos processar uma InternalMessage.
Autenticacao: header `X-Api-Key` (compartilhado entre n8n e middleware, configurado no .env).

## Base URL

```
http://gf-atendimento-api:3200   (interno Docker Swarm)
```

---

## POST /conversations/:id/messages

Envia mensagem ao cliente via Chatwoot API usando credenciais da conta correta.

### Request

```http
POST /conversations/45/messages
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}
Idempotency-Key: {uuid-v4}

{
  "content": "Ola! Como posso ajudar?",
  "contentType": "text",
  "private": false
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| content | string | sim | Texto da mensagem |
| contentType | "text" | sim | Apenas texto nesta versao |
| private | boolean | nao (default: false) | true = nota interna para agentes |

**Header `Idempotency-Key`** (recomendado): UUID v4 gerado pelo n8n por tentativa logica.
Requisicoes com mesma chave dentro de 5 minutos retornam a resposta cacheada sem reenviar ao Chatwoot.
Dedup via Redis (`idempotency:{key}` com TTL 300s). Se ausente, sem protecao contra retry duplicado.

### Response 200

```json
{
  "messageId": "chatwoot-msg-id-123",
  "status": "sent"
}
```

### Response 404

```json
{
  "error": "Conversa 45 nao encontrada no middleware",
  "code": "CONVERSATION_NOT_FOUND"
}
```

### Response 502

```json
{
  "error": "Falha ao enviar mensagem pelo Chatwoot",
  "code": "CHATWOOT_ERROR",
  "detail": "..."
}
```

---

## POST /conversations/:id/handoff

Executa transferencia bot→humano: seta status `pending` no Chatwoot, atribui time/agente,
registra em `handoff_log`, seta `bot_active=false` no banco.

### Request

```http
POST /conversations/45/handoff
Content-Type: application/json
X-Api-Key: {MIDDLEWARE_API_KEY}

{
  "teamId": 1,
  "agentId": null,
  "reason": "Cliente solicitou falar com humano"
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| teamId | number | nao* | ID do time Chatwoot |
| agentId | number | nao* | ID do agente Chatwoot |
| reason | string | nao | Motivo do handoff (auditoria) |

*Ao menos um de `teamId` ou `agentId` deve ser fornecido.

### Response 200

```json
{
  "status": "ok",
  "botActive": false,
  "conversationStatus": "pending"
}
```

### Response 400

```json
{
  "error": "Ao menos teamId ou agentId deve ser informado",
  "code": "MISSING_HANDOFF_TARGET"
}
```

---

## GET /health

Valida conectividade com PostgreSQL, MinIO, Redis e Chatwoot API.

### Response 200 (tudo saudavel)

```json
{
  "status": "ok",
  "checks": {
    "postgresql": "ok",
    "redis": "ok",
    "minio": "ok",
    "chatwoot": "ok"
  }
}
```

### Response 503 (algum componente com falha)

```json
{
  "status": "degraded",
  "checks": {
    "postgresql": "ok",
    "redis": "ok",
    "minio": "error: connect ECONNREFUSED",
    "chatwoot": "ok"
  }
}
```

---

## POST /webhooks/chatwoot

Recebe webhooks do Chatwoot. Retorna 200 imediatamente (processamento assincrono).
Nao requer autenticacao de API Key — Chatwoot envia diretamente.
Validacao: header `X-Chatwoot-Hmac-Sha256` (se configurado no Chatwoot).

### Request (example: message_created)

```http
POST /webhooks/chatwoot
Content-Type: application/json
X-Chatwoot-Hmac-Sha256: {hmac}

{ ...payload Chatwoot... }
```

### Response 200 (sempre, independente do processamento)

```json
{ "received": true }
```
