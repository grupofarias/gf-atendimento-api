# Contract: InternalMessage

**Version**: 1.0 | **Date**: 2026-05-02

Payload entregue pelo middleware ao n8n (POST para `bots.webhook_url`) para cada mensagem
incoming do cliente. Este e o contrato central do sistema.

## Endpoint de destino

```
POST {bots.webhook_url}
Content-Type: application/json
X-Webhook-Secret: {bots.webhook_secret}   (se configurado)
```

## Schema

```json
{
  "messageId": "abc123",
  "conversationId": 45,
  "contactId": 12,
  "phone": "+5511999998888",
  "inboxId": 3,
  "channelType": "whatsapp",
  "contentType": "text",
  "botCode": "atendimento-geral",
  "text": "Ola, preciso de ajuda",
  "timestamp": 1746144000000
}
```

## Exemplos por contentType

### text

```json
{
  "messageId": "msg-001",
  "conversationId": 45,
  "contactId": 12,
  "phone": "+5511999998888",
  "inboxId": 3,
  "channelType": "whatsapp",
  "contentType": "text",
  "botCode": "atendimento-geral",
  "text": "Ola",
  "timestamp": 1746144000000
}
```

### audio

```json
{
  "messageId": "msg-002",
  "conversationId": 45,
  "contactId": 12,
  "phone": "+5511999998888",
  "inboxId": 3,
  "channelType": "whatsapp",
  "contentType": "audio",
  "botCode": "atendimento-geral",
  "media": {
    "url": "https://s3minio.infragf.com.br/chatwoot/...",
    "mimeType": "audio/ogg; codecs=opus",
    "duration": 10,
    "viewOnce": false
  },
  "timestamp": 1746144000000
}
```

### image

```json
{
  "messageId": "msg-003",
  "conversationId": 45,
  "contentType": "image",
  "media": {
    "url": "https://s3minio.infragf.com.br/chatwoot/...",
    "mimeType": "image/jpeg",
    "filename": "foto.jpg",
    "size": 204800,
    "caption": "Veja essa imagem",
    "viewOnce": false
  },
  "timestamp": 1746144000000
}
```

### view_once

```json
{
  "messageId": "msg-004",
  "conversationId": 45,
  "contentType": "view_once",
  "media": {
    "url": "",
    "mimeType": "image/jpeg",
    "viewOnce": true
  },
  "timestamp": 1746144000000
}
```

**Invariante**: `media.url` e sempre `""` para view_once. Jamais aparece em log ou payload.

### location

```json
{
  "contentType": "location",
  "location": {
    "latitude": -23.5505,
    "longitude": -46.6333,
    "label": "Sao Paulo"
  }
}
```

## Campos opcionais por contentType

| contentType | text | media | location | contactCard | adContext | reaction |
|-------------|------|-------|----------|-------------|-----------|----------|
| text | sim | - | - | - | - | - |
| audio | - | sim | - | - | - | - |
| image | - | sim | - | - | - | - |
| video | - | sim | - | - | - | - |
| file | - | sim | - | - | - | - |
| sticker | - | sim | - | - | - | - |
| location | - | - | sim | - | - | - |
| contact_card | - | - | - | sim | - | - |
| ad | - | - | - | - | sim | - |
| view_once | - | sim (url='') | - | - | - | - |
| reaction | - | - | - | - | - | sim |
| poll | text | - | - | - | - | - |
| unsupported | - | - | - | - | - | - |

## Campo media.error (resolucao falhou)

Quando middleware nao consegue resolver URL de midia (Chatwoot fora do ar, redirect falhou),
encaminha ao n8n com `media.url = ''` e `media.error` preenchido. Processamento nao e bloqueado.

```json
{
  "contentType": "audio",
  "media": {
    "url": "",
    "mimeType": "audio/ogg; codecs=opus",
    "viewOnce": false,
    "error": "unresolvable"
  }
}
```

Valores possiveis de `media.error`: `"unresolvable"` (unico valor desta versao).

## Garantias do middleware

1. `phone` sempre no formato E.164 (ex: `+5511999998888`)
2. `media.url` acessivel sem autenticacao (URL MinIO direta), salvo quando `media.error` presente
3. `media.url = ""` para qualquer `view_once`
4. Sem duplicatas: mesmo `messageId` entregue no maximo uma vez
5. `contentType: "unsupported"` para tipos desconhecidos — nunca erro 500
6. Quando `media.error` presente, `media.url` e sempre `""` — n8n deve tratar ausencia de midia
