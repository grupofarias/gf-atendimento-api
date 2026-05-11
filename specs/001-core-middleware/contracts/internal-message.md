# Contract: InternalMessage

**Version**: 2.0 | **Date**: 2026-05-11

Payload retornado pelo endpoint `POST /normalize` quando `skip: false`.
O n8n recebe este objeto e decide o que fazer baseado nos campos de roteamento.

## Schema completo

```json
{
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
```

## Campos de roteamento (n8n decide com base neles)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `event` | string | Evento Chatwoot: `message_created`, `conversation_updated`, etc. |
| `messageType` | `incoming` \| `outgoing` \| `activity` | Direção da mensagem |
| `isPrivate` | boolean | `true` = nota interna para agentes |
| `senderType` | string \| undefined | `contact`, `agent`, `user` — quem enviou |
| `labels` | string[] | Tags atuais da conversa no Chatwoot |

**Regra típica no n8n**: processar com IA apenas quando `event === "message_created"` && `messageType === "incoming"` && `!isPrivate`.

## Campos de identificação

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `messageId` | string | ID da mensagem no Chatwoot (dedup key) |
| `conversationId` | number | ID da conversa no Chatwoot |
| `contactId` | number \| undefined | ID do contato no banco local do middleware |
| `phone` | string | Número E.164 do contato (`+5511999998888`) |
| `inboxId` | number | ID do inbox no Chatwoot |
| `channelType` | string | `whatsapp` \| `webchat` \| `instagram` \| `facebook` \| `api` |
| `botCode` | string | Código do bot configurado para este inbox |
| `timestamp` | number | Unix timestamp em milissegundos |

## Exemplos por contentType

### text

```json
{
  "event": "message_created",
  "messageType": "incoming",
  "isPrivate": false,
  "senderType": "contact",
  "labels": [],
  "contentType": "text",
  "text": "Ola",
  "conversationId": 14,
  "phone": "+5511933030497",
  "timestamp": 1746144000000
}
```

### audio

```json
{
  "contentType": "audio",
  "media": {
    "url": "https://s3minio.infragf.com.br/chatwoot/...",
    "mimeType": "audio/ogg",
    "size": 50000,
    "viewOnce": false
  }
}
```

### image

```json
{
  "contentType": "image",
  "media": {
    "url": "https://s3minio.infragf.com.br/chatwoot/w30jdm9x...?X-Amz-Signature=...",
    "mimeType": "image/jpeg",
    "size": 176953,
    "viewOnce": false
  }
}
```

URL é assinada (válida por 5 min). Processar imediatamente após receber.

### view_once

```json
{
  "contentType": "view_once",
  "media": {
    "url": "",
    "mimeType": "image/jpeg",
    "viewOnce": true
  }
}
```

**Invariante**: `media.url` é sempre `""` para view_once. Jamais aparece em log ou payload.

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

| contentType | text | media | location |
|-------------|------|-------|----------|
| text | sim | - | - |
| audio | - | sim | - |
| image | - | sim | - |
| video | - | sim | - |
| file | - | sim | - |
| sticker | - | sim | - |
| location | - | - | sim |
| view_once | - | sim (url='') | - |
| poll | sim | - | - |
| unsupported | - | - | - |

## media.error (resolução falhou)

Quando o middleware não consegue resolver a URL de mídia:

```json
{
  "contentType": "audio",
  "media": {
    "url": "",
    "mimeType": "audio/ogg",
    "viewOnce": false,
    "error": "unresolvable"
  }
}
```

Quando `media.error` presente: `media.url` sempre `""`. n8n deve tratar ausência de mídia.

## Garantias do middleware

1. `phone` sempre E.164 (`+5511999998888`)
2. `media.url` URL MinIO direta (sem auth), salvo `media.error` ou `view_once`
3. `media.url = ""` invariável para `view_once`
4. Sem duplicatas: mesmo `messageId` retorna `skip: true` nas próximas chamadas
5. `contentType: "unsupported"` para tipos desconhecidos — nunca erro 500
6. `labels` sempre presente (array vazio se sem tags)
