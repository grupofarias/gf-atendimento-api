# Feature Specification: Core Middleware de Atendimento

**Feature Branch**: `001-core-middleware`
**Created**: 2026-05-02
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analista recebe mensagem normalizada no n8n (Priority: P1)

Um analista de atendimento configurou um workflow n8n para responder clientes via WhatsApp.
Quando um cliente manda qualquer tipo de mensagem (texto, áudio, imagem, documento, localização),
o workflow n8n recebe um objeto padronizado com todos os campos já tratados: número normalizado,
URL de mídia estável, tipo de conteúdo identificado. O analista não precisa saber que existem
plataformas diferentes (Chatwoot, Evolution, WhatsApp) — ele recebe sempre o mesmo formato.

**Why this priority**: Sem isso, não há valor algum. É o ponto de entrada de tudo. Analistas
com pouco conhecimento técnico precisam de um contrato de dados estável e confiável.

**Independent Test**: Enviar mensagem de texto, áudio e imagem pelo WhatsApp de teste.
Verificar que o workflow n8n recebe o payload normalizado com os campos corretos para cada tipo.
Entrega valor imediato: analistas conseguem construir fluxos de atendimento.

**Acceptance Scenarios**:

1. **Given** cliente envia mensagem de texto "Olá",
   **When** mensagem chega ao middleware via webhook do Chatwoot,
   **Then** n8n recebe payload com `contentType: 'text'`, `text: 'Olá'`, `phone` em E.164,
   `conversationId`, `contactId`, `inboxId` e `channelType` preenchidos.

2. **Given** cliente envia áudio de 10 segundos,
   **When** middleware processa o webhook,
   **Then** n8n recebe payload com `contentType: 'audio'`, `media.url` apontando para MinIO
   estável (não expira), `media.duration: 10`, `media.mimeType` preenchido.

3. **Given** cliente envia imagem,
   **When** middleware resolve a URL do Active Storage do Chatwoot,
   **Then** n8n recebe `media.url` como URL direta do MinIO (sem autenticação necessária),
   já que o arquivo já estava no MinIO usado pelo Chatwoot.

4. **Given** cliente envia mídia de visualização única (view_once),
   **When** middleware normaliza,
   **Then** n8n recebe `contentType: 'view_once'`, `media.url: ''`, `media.viewOnce: true`.
   URL nunca aparece em nenhum log ou payload.

5. **Given** mensagem `outgoing` (enviada por agente) ou nota privada (`private: true`) chega no webhook,
   **When** middleware filtra,
   **Then** webhook retorna 200 sem encaminhar ao n8n. Nenhum processamento ocorre.

6. **Given** mesmo evento de webhook chega duas vezes (Chatwoot retentativa),
   **When** middleware verifica dedup,
   **Then** primeira ocorrência é encaminhada ao n8n. Segunda é descartada silenciosamente.
   n8n não recebe duplicata.

---

### User Story 2 - Bot responde cliente via endpoint do middleware (Priority: P1)

Após processar com IA, o workflow n8n chama o middleware para enviar a resposta ao cliente.
O analista não precisa saber qual Chatwoot account, qual token, qual endpoint exato — apenas
chama `POST /conversations/:id/messages` com o texto. O middleware resolve tudo.

**Why this priority**: Par inseparável do User Story 1. Sem resposta, o middleware não entrega
valor de negócio.

**Independent Test**: Após receber InternalMessage do User Story 1, workflow n8n chama endpoint
de mensagens do middleware. Cliente recebe a mensagem no WhatsApp.

**Acceptance Scenarios**:

1. **Given** n8n tem `conversationId` de uma conversa ativa,
   **When** chama `POST /conversations/45/messages` com `{ content: "Olá! Como posso ajudar?", contentType: "text" }`,
   **Then** cliente recebe a mensagem no WhatsApp em menos de 3 segundos.
   Middleware retorna `{ messageId, status: "sent" }`.

2. **Given** n8n quer enviar nota interna visível apenas para agentes,
   **When** chama endpoint com `private: true`,
   **Then** mensagem aparece no Chatwoot como nota interna. Cliente não recebe nada.

3. **Given** `conversationId` não existe no middleware,
   **When** n8n chama endpoint de mensagens,
   **Then** middleware retorna erro 404 com mensagem descritiva. n8n pode tratar o erro.

---

### User Story 3 - Handoff bot para humano com atribuição de setor (Priority: P2)

O workflow n8n decide que a conversa precisa de atendimento humano. Chama um endpoint do
middleware passando o ID do time (setor) ou do agente. O middleware executa a transferência
no Chatwoot, registra o evento no log de auditoria e marca o bot como inativo para essa
conversa.

**Why this priority**: Funcionalidade central do atendimento. Sem handoff, o bot nunca
transfere para humanos, invalidando o modelo híbrido bot+humano.

**Independent Test**: Workflow n8n chama endpoint de handoff. Verificar que a conversa no
Chatwoot foi atribuída ao time correto, status mudou para "pending" e bot não responde mais
mensagens subsequentes nessa conversa.

**Acceptance Scenarios**:

1. **Given** conversa com bot ativo,
   **When** n8n chama `POST /conversations/45/handoff` com `{ teamId: 1, reason: "solicitou falar com humano" }`,
   **Then** conversa no Chatwoot fica com status "pending", time "comercial" é atribuído,
   bot_active=false no banco, evento registrado em handoff_log com reason.

2. **Given** agente humano assume conversa diretamente pelo painel do Chatwoot (sem passar pelo n8n),
   **When** Chatwoot dispara webhook `conversation_updated` com assignee preenchido,
   **Then** middleware automaticamente seta bot_active=false para essa conversa.
   Bot para de responder sem precisar de intervenção manual.

3. **Given** conversa foi resolvida e cliente manda nova mensagem dias depois,
   **When** Chatwoot reabre a conversa (`conversation_status_changed` com status "open"),
   **Then** middleware reativa bot_active=true. Bot retoma o atendimento automaticamente.

---

### User Story 4 - Gerenciamento de múltiplas contas sem restart (Priority: P2)

O time de TI precisa adicionar uma nova instância WhatsApp (novo inbox, nova conta Chatwoot
ou nova instância Evolution) sem derrubar o middleware em produção. Toda a configuração
de credenciais é feita via API ou banco de dados.

**Why this priority**: Com 29+ agentes e crescimento previsto, a capacidade de adicionar
canais sem downtime é operacionalmente crítica.

**Independent Test**: Adicionar nova entrada em `chatwoot_accounts` e `inbox_config` no banco.
Enviar mensagem pelo novo inbox. Verificar que middleware processa corretamente sem restart.

**Acceptance Scenarios**:

1. **Given** nova conta Chatwoot adicionada no banco (`chatwoot_accounts`),
   **When** webhook chega com `account.id` dessa nova conta,
   **Then** middleware usa as credenciais corretas para resolver mídia e enviar respostas.
   Nenhuma variável de ambiente foi alterada. Nenhum restart foi necessário.

2. **Given** novo inbox criado no Chatwoot e mapeado em `inbox_config`,
   **When** primeira mensagem chega por esse inbox,
   **Then** middleware identifica o bot configurado para esse inbox e encaminha ao n8n correto.

---

### User Story 5 - Contato novo é criado automaticamente (Priority: P3)

Cliente manda mensagem pela primeira vez. O middleware garante que o contato existe no banco
local antes de encaminhar ao n8n. n8n recebe `contactId` garantido, sem precisar fazer lookup.

**Why this priority**: Necessário para rastreabilidade e estado de conversa, mas não bloqueia
o fluxo básico se feito de forma eventual.

**Independent Test**: Número desconhecido manda mensagem. Verificar que entrada aparece em
`contacts` com telefone E.164. n8n recebe `contactId` preenchido.

**Acceptance Scenarios**:

1. **Given** mensagem de número `+5511999998888` que nunca enviou antes,
   **When** middleware processa webhook,
   **Then** contato criado no banco com `phone: '+5511999998888'`.
   InternalMessage encaminhada ao n8n inclui `contactId` desse contato.

2. **Given** mesmo número manda segunda mensagem,
   **When** middleware processa,
   **Then** contato existente é reutilizado. Nenhum duplicado criado.
   Race condition (duas mensagens simultâneas do mesmo número) não cria dois registros.

---

### Edge Cases

- O que acontece quando Chatwoot está fora do ar e middleware tenta resolver URL de mídia?
  → Middleware deve encaminhar ao n8n com `media.url: ''` e `media.error: 'unresolvable'`.
  Não bloquear o processamento da mensagem de texto.
- O que acontece quando n8n está fora do ar e middleware tenta encaminhar InternalMessage?
  → Webhook retorna 200 para Chatwoot (evitar retry storm). Registrar falha internamente.
  Operador é alertado via observabilidade.
- O que acontece quando `phone` chega sem prefixo de país (ex: `11999998888`)?
  → Middleware normaliza para E.164 assumindo Brasil (+55). Registra a normalização aplicada.
- O que acontece com mensagens de grupos WhatsApp?
  → Filtradas e descartadas. Grupos não são suportados nesta versão.
- O que acontece quando dois webhooks do mesmo evento chegam em menos de 1 segundo?
  → Primeiro processado normalmente. Segundo descartado pelo dedup por `message.id`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST receber webhooks do Chatwoot e retornar HTTP 200 antes de qualquer
  processamento externo (operação assíncrona obrigatória).

- **FR-002**: Sistema MUST normalizar qualquer webhook de mensagem recebida para o formato
  `InternalMessage` independente do canal de origem (WhatsApp, Webchat, Instagram, Facebook).

- **FR-003**: Sistema MUST descartar mensagens com `message_type` diferente de `incoming`,
  `private: true`, `sender.type` diferente de `contact`, e mensagens de grupos.

- **FR-004**: Sistema MUST implementar dedup por `message.id` do webhook. Segunda chegada do
  mesmo ID MUST ser descartada silenciosamente. Dedup MUST funcionar com múltiplas réplicas.

- **FR-005**: Sistema MUST resolver URLs de mídia do Active Storage do Chatwoot para URLs
  diretas do MinIO seguindo o redirect. URL resultante MUST ser acessível sem autenticação.

- **FR-006**: Sistema MUST definir `media.url = ''` para qualquer mídia com `viewOnce: true`,
  antes de qualquer log, persistência ou encaminhamento.

- **FR-007**: Sistema MUST encaminhar `InternalMessage` normalizada para o webhook n8n
  configurado para o inbox de origem.

- **FR-008**: Sistema MUST expor `POST /conversations/:id/messages` que envia mensagem para
  o cliente via Chatwoot API usando as credenciais da conta correta do banco de dados.

- **FR-009**: Sistema MUST expor `POST /conversations/:id/handoff` que executa transferência
  no Chatwoot (status pending + atribuição de time/agente) e registra em log de auditoria.

- **FR-010**: Sistema MUST atualizar `bot_active=false` quando webhook `conversation_updated`
  indicar que um agente humano foi atribuído à conversa.

- **FR-011**: Sistema MUST normalizar todos os números de telefone para formato E.164 antes de
  qualquer operação de busca ou persistência de contato.

- **FR-012**: Sistema MUST suportar múltiplas contas Chatwoot e instâncias Evolution com
  credenciais armazenadas no banco de dados. Adicionar nova conta MUST NOT exigir restart.

- **FR-013**: Sistema MUST expor `GET /health` que valida conectividade com PostgreSQL, MinIO,
  Redis e Chatwoot API.

- **FR-014**: Registros de dedup com mais de 48 horas MUST ser purgados automaticamente.

### Key Entities

- **InternalMessage**: Representação normalizada de uma mensagem recebida, independente de
  plataforma. Contém identificadores, tipo de canal, tipo de conteúdo, campos de mídia
  opcionais, e contexto de roteamento (botCode, inboxId).

- **Conversation**: Estado local de uma conversa — se o bot está ativo, status atual. Espelha
  parcialmente o Chatwoot mas é a fonte de verdade para `bot_active`.

- **Contact**: Identificação de um contato por telefone normalizado. Referência ao ID Chatwoot
  correspondente.

- **ChatwootAccount**: Credenciais e URL base de uma conta Chatwoot. Suporta múltiplas contas.

- **EvolutionInstance**: Credenciais e URL base de uma instância Evolution. Referenciada por
  inboxes WhatsApp.

- **InboxConfig**: Mapeamento de inbox Chatwoot para conta, instância Evolution e bot.

- **Bot**: Configuração do processador de IA (n8n ou Botpress) para um grupo de inboxes.

- **HandoffLog**: Registro auditável de cada transferência bot→humano com motivo e destino.

- **ProcessedEvent**: Registro de dedup por `(source, external_id)`. TTL de 48 horas.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Analista de n8n recebe payload `InternalMessage` completo em menos de 2 segundos
  após cliente enviar mensagem no WhatsApp.

- **SC-002**: Zero mensagens duplicadas processadas pelo n8n em condições normais de operação
  (Chatwoot retentativas incluídas).

- **SC-003**: 100% das mídias recebidas (exceto view_once) chegam ao n8n com URL acessível
  diretamente, sem necessidade de autenticação adicional.

- **SC-004**: Handoff bot→humano executado em menos de 3 segundos a partir da chamada do
  endpoint pelo n8n, com registro auditável.

- **SC-005**: Adição de nova conta Chatwoot ou inbox sem downtime ou restart da aplicação.

- **SC-006**: URLs de mídia `view_once` nunca aparecem em logs, payloads ao n8n ou respostas
  de API. Verificável por auditoria de logs.

- **SC-007**: Após agente humano assumir conversa no Chatwoot, bot para de responder em menos
  de 30 segundos (tempo do próximo webhook `conversation_updated`).

---

## Assumptions

- Chatwoot já está configurado com `ACTIVE_STORAGE_SERVICE=s3_compatible` apontando para o
  MinIO em `s3minio.infragf.com.br`, bucket `chatwoot`. Arquivos de mídia já residem no MinIO.
- n8n continua responsável pelo debounce de mensagens fragmentadas (Redis, 5-8 segundos).
  Middleware não implementa debounce — encaminha cada mensagem individualmente ao n8n.
- O Chatwoot `toggle_status bot` (via API) está quebrado nesta instância e não será utilizado.
  `bot_active` é gerenciado exclusivamente pelo banco local do middleware.
- Grupos WhatsApp estão fora de escopo nesta versão.
- Suporte a múltiplos idiomas está fora de escopo. Interface e logs em português.
- Transcrição de áudio (STT) e análise de imagem (vision) são responsabilidade dos
  workflows n8n, não do middleware. Middleware apenas resolve a URL da mídia.
- Redis está disponível na infraestrutura para lock distribuído de `upsertContact`.
- JetSales está sendo descontinuado. Módulos legados serão removidos durante o desenvolvimento.
