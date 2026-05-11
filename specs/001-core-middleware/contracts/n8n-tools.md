# n8n AI Agent Tools — gf-atendimento-api

Base URL: `https://gfatend.loclx.io`
Header fixo em todos: `x-api-key: 621e5d1deafeab57f513e773556d164e`

> `conversationId` vem sempre no payload do `/normalize` como `message.conversationId`.

---

## Tool 1 — send_message

**Nome:** `send_message`
**Descrição para o LLM:**
> Envia uma mensagem de texto para o cliente na conversa ativa. Use para responder ao cliente. Passe private=true para enviar nota interna visível apenas para agentes no Chatwoot.

**Método:** POST
**URL:** `https://gfatend.loclx.io/conversations/{{ $fromAI('conversationId') }}/messages`

**Body (JSON Schema para o n8n):**
```json
{
  "type": "object",
  "properties": {
    "conversationId": {
      "type": "number",
      "description": "ID da conversa recebido no payload do normalize"
    },
    "content": {
      "type": "string",
      "description": "Texto da mensagem a ser enviada ao cliente"
    },
    "contentType": {
      "type": "string",
      "enum": ["text"],
      "description": "Tipo do conteúdo. Sempre 'text' por enquanto"
    },
    "private": {
      "type": "boolean",
      "description": "Se true, envia como nota interna (só agentes veem). Default false"
    }
  },
  "required": ["conversationId", "content", "contentType"]
}
```

---

## Tool 2 — handoff_to_human

**Nome:** `handoff_to_human`
**Descrição para o LLM:**
> Transfere a conversa para um atendente humano. Use quando o cliente solicitar falar com humano, quando a IA não souber responder, ou quando a situação exigir intervenção humana. Define bot como inativo para essa conversa.

**Método:** POST
**URL:** `https://gfatend.loclx.io/conversations/{{ $fromAI('conversationId') }}/handoff`

**Body (JSON Schema):**
```json
{
  "type": "object",
  "properties": {
    "conversationId": {
      "type": "number",
      "description": "ID da conversa recebido no payload do normalize"
    },
    "agentId": {
      "type": "number",
      "description": "ID do agente específico para atribuir. Opcional — se omitido, fica sem atribuição"
    },
    "teamId": {
      "type": "number",
      "description": "ID do time/setor para atribuir. Opcional"
    },
    "reason": {
      "type": "string",
      "description": "Motivo do handoff para registro em log. Ex: 'Cliente solicitou falar com humano'"
    }
  },
  "required": ["conversationId", "reason"]
}
```

---

## Tool 3 — add_labels

**Nome:** `add_labels`
**Descrição para o LLM:**
> Adiciona etiquetas/tags à conversa no Chatwoot. Use para categorizar: assunto do atendimento, intenção detectada, produto mencionado, etc. Não remove labels existentes.

**Método:** POST
**URL:** `https://gfatend.loclx.io/conversations/{{ $fromAI('conversationId') }}/labels`

**Body (JSON Schema):**
```json
{
  "type": "object",
  "properties": {
    "conversationId": {
      "type": "number",
      "description": "ID da conversa recebido no payload do normalize"
    },
    "labels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Lista de etiquetas a adicionar. Ex: ['financeiro', 'urgente']"
    }
  },
  "required": ["conversationId", "labels"]
}
```

---

## Tool 4 — set_conversation_status

**Nome:** `set_conversation_status`
**Descrição para o LLM:**
> Altera o status da conversa no Chatwoot. Use 'resolved' quando o atendimento for concluído. Use 'pending' para indicar que aguarda ação humana. Use 'open' para reabrir.

**Método:** PATCH
**URL:** `https://gfatend.loclx.io/conversations/{{ $fromAI('conversationId') }}/status`

**Body (JSON Schema):**
```json
{
  "type": "object",
  "properties": {
    "conversationId": {
      "type": "number",
      "description": "ID da conversa recebido no payload do normalize"
    },
    "status": {
      "type": "string",
      "enum": ["open", "pending", "resolved", "snoozed"],
      "description": "Novo status da conversa"
    }
  },
  "required": ["conversationId", "status"]
}
```

---

## Como configurar no n8n

1. No nó **AI Agent**, clique em **Add Tool → HTTP Request Tool**
2. Para cada tool acima:
   - **Name**: nome do tool
   - **Description**: cole a descrição para o LLM
   - **Method**: conforme especificado
   - **URL**: cole a URL (o `$fromAI(...)` é substituído pelo LLM automaticamente)
   - **Authentication**: Header Auth → `x-api-key` = `621e5d1deafeab57f513e773556d164e`
   - **Body**: JSON com os campos do schema
   - Marque **"Optimize response"** para reduzir tokens na resposta

3. No system prompt do agente, inclua:
   > "O conversationId está disponível em `{{ $json.conversationId }}` do trigger."
