# Tasks: Core Middleware de Atendimento

**Input**: Design documents from `specs/001-core-middleware/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Stack**: NestJS 11 + TypeScript 5 + PostgreSQL 16 + pgvector (TypeORM) + Redis + MinIO

---

## Phase 1: Setup (Infraestrutura Inicial)

**Purpose**: Inicializar projeto NestJS do zero com tooling correto.

- [X] T001 Inicializar projeto NestJS: `nest new gf-atendimento-api --package-manager npm` na raiz
- [X] T002 Configurar tsconfig.json com `strict: true`, `paths` para `@domain/*`, `@adapters/*`, `@modules/*`
- [X] T003 [P] Adicionar dependencias com versoes fixas:
  - `@nestjs/common@^11.1.19 @nestjs/core@^11.1.19 @nestjs/platform-express@^11.1.19`
  - `@nestjs/typeorm@^11.0.1 typeorm@^0.3.28 pg@^8.20.0 @types/pg@^8.20.0`
  - `@nestjs/config@^4.0.4 @nestjs/schedule@^6.1.3 @nestjs/terminus@^11.1.1`
  - `ioredis@^5.10.1 @aws-sdk/client-s3@^3.1041.0 axios@^1.15.2`
  - `class-validator@^0.15.1 class-transformer@^0.5.1 reflect-metadata@^0.2.2 rxjs@^7.8.2`
  - Adicionar `"overrides": { "uuid": "~11.1.1" }` no package.json (resolve npm audit moderado de TypeORM → uuid GHSA-w5hq-g745-h8pq; risco real zero pois TypeORM usa apenas v4() sem buf customizado)
- [X] T004 [P] Configurar ESLint + Prettier com regras do projeto (sem console.log, import order)
- [X] T005 Criar `docker-compose.yml` (producao) e `docker-compose.dev.yml` (dev) seguindo padrao helen-lms-api:
  - `postgres` service: imagem `pgvector/pgvector:pg16`, volume `postgres_data`, healthcheck `pg_isready`
  - `redis` service: `redis:7-alpine`
  - `backup` service: `docker/backup/` (Dockerfile pg_dump + MinIO mc, cron diario) — igual helen
  - `api` service: build local, depends_on postgres (healthcheck), env `DATABASE_URL`
- [X] T006 Criar `.env.example` com variaveis documentadas: `DATABASE_URL=postgresql://...`, `MINIO_*`, `APP_SECRET`, `PORT`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `MIDDLEWARE_API_KEY`, `REDIS_HOST`, `REDIS_PORT`
- [X] T006a Criar `docker/backup/Dockerfile`, `docker/backup/backup.sh`, `docker/backup/crontab` (backup pg_dump → MinIO, mesmo padrao helen-lms-api)

**Checkpoint**: `npm run start:dev` sobe sem erros.

---

## Phase 2: Fundacao (Prerequisitos que Bloqueiam Todas as Stories)

**Purpose**: TypeORM, entities, migrations, conexoes Redis/MinIO, logging estruturado.

**CRITICO**: Nenhuma user story comeca antes desta fase.

- [X] T007 Criar `src/config/configuration.ts` com `class-validator` validando todas as variaveis de ambiente obrigatorias
- [X] T008 Criar entity `src/database/entities/chatwoot-account.entity.ts` (tabela `chatwoot_accounts`)
- [X] T009 [P] Criar entity `src/database/entities/evolution-instance.entity.ts` (tabela `evolution_instances`)
- [X] T010 [P] Criar entity `src/database/entities/bot.entity.ts` (tabela `bots`)
- [X] T011 [P] Criar entity `src/database/entities/inbox-config.entity.ts` (tabela `inbox_config`, FK para chatwoot_accounts + evolution_instances + bots)
- [X] T012 [P] Criar entity `src/database/entities/contact.entity.ts` (tabela `contacts`, FK chatwoot_account_id → chatwoot_accounts, UNIQUE (chatwoot_account_id, phone))
- [X] T013 [P] Criar entity `src/database/entities/conversation.entity.ts` (tabela `conversations`, campo `bot_active`, FK para contacts + inbox_config)
- [X] T014 [P] Criar entity `src/database/entities/handoff-log.entity.ts` (tabela `handoff_log`)
- [X] T015 [P] Criar entity `src/database/entities/processed-event.entity.ts` (tabela `processed_events`, UNIQUE source+external_id, index em created_at)
- [X] T015a [P] Criar entity `src/database/entities/outbox.entity.ts` (tabela `outbox`, FK conversation_id, status enum pending/sent/failed, campo payload JSONB, webhook_url, attempts, last_error, sent_at — ver data-model.md)
- [X] T016 Configurar TypeORM em `AppModule` com driver `postgres`, `synchronize: false`, `migrations: ['dist/database/migrations/*.js']`, `DATABASE_URL` como connection string
- [X] T017 Gerar e rodar migration inicial: `npm run migration:generate -- CreateAllTables` (cria todas as tabelas do data-model.md)
- [X] T018 Criar `src/adapters/minio/minio.adapter.ts` com `@aws-sdk/client-s3` — metodo `resolvePresignedUrl(activeStorageUrl)` que segue redirect 302 e retorna URL MinIO
- [X] T019 Criar `src/adapters/n8n/n8n.adapter.ts` com metodo `forwardInternalMessage(msg: InternalMessage)` — POST para `bots.webhook_url` com header `X-Webhook-Secret`
- [X] T020 Criar `RedisModule` em `src/common/redis/` usando `ioredis` — expoe `IORedis` client para injecao
- [X] T021 Criar `LoggingInterceptor` global em `src/common/interceptors/` — injeta `conversationId` e `messageId` em todos os logs via `AsyncLocalStorage`

**Checkpoint**: `npm run migration:run` completa sem erros. Todas as tabelas criadas.

---

## Phase 3: User Story 1 - Mensagem Normalizada no n8n (P1) MVP

**Goal**: Cliente envia mensagem -> middleware recebe webhook Chatwoot -> normaliza para InternalMessage -> resolve URL de midia -> deduplica -> encaminha ao n8n.

**Independent Test**: Enviar mensagem de texto, audio e imagem pelo WhatsApp de teste. Verificar que o webhook n8n recebe payload InternalMessage com campos corretos para cada tipo. Verificar que segunda entrega do mesmo evento nao gera segunda chamada ao n8n.

- [X] T022 Criar tipo `InternalMessage` e enums `ContentType`, `ChannelType` em `src/domain/types/internal-message.type.ts` (exatamente conforme contracts/internal-message.md)
- [X] T023 [P] [US1] Criar `src/domain/normalize/phone.util.ts` — normaliza numero para E.164, assume +55 se sem prefixo de pais
- [X] T024 [P] [US1] Criar `src/domain/normalize/normalizer.service.ts` — converte payload webhook Chatwoot para InternalMessage. Filtra: message_type != incoming, private: true, sender.type != contact, grupos. Aplica `media.url = ''` para view_once ANTES de qualquer outro processamento
- [X] T025 [P] [US1] Criar `src/domain/media/media-resolver.service.ts` — dado URL Active Storage do Chatwoot, segue redirect HTTP 302 e retorna URL MinIO direta. Em caso de falha, retorna `{ url: '', error: 'unresolvable' }` sem bloquear processamento
- [X] T026 [US1] Criar `src/domain/dedup/dedup.service.ts` — tenta INSERT em processed_events(source, external_id); captura erro de UNIQUE violation e retorna `isDuplicate: true`. Expoe tambem metodo de purge para o cron
- [X] T027 [US1] Criar `src/modules/contacts/contacts.service.ts` — `upsertContact(phone, chatwootContactId?)`: busca por phone E.164, cria se nao existe, retorna `Contact`. Sem lock Redis nesta fase (US5 adiciona lock)
- [X] T028 [US1] Criar `src/modules/conversations/conversations.service.ts` — `upsertConversation(chatwootConversationId, inboxId, contactId)`: busca ou cria; expoe `setBotActive(conversationId, active)` e `setStatus(conversationId, status)`
- [X] T029 [US1] Criar `src/modules/webhook/webhook.service.ts` — pipeline: 1) filtrar 2) dedup 3) normalizar 4) resolver midia 5) upsertContact 6) upsertConversation 7) INSERT em outbox(status=pending) 8) encaminhar via OutboxWorker. IMPORTANTE: steps 1-7 sao sincronos dentro do handler; step 8 (POST ao n8n) roda via worker assincrono
- [X] T029a [US1] Criar `src/domain/outbox/outbox-worker.service.ts` — consome registros outbox(status=pending), POST ao n8n, UPDATE status=sent. Job de recovery no startup: busca pending com created_at < NOW()-30s e retenta. Purge: sent com sent_at < NOW()-48h (junto ao cron de processed_events)
- [X] T030 [US1] Criar `src/modules/webhook/webhook.controller.ts` — `POST /webhooks/chatwoot`: persiste em outbox (sincrono), retorna `{ received: true }` 200, worker processa async
- [X] T031 [US1] Criar `src/modules/webhook/webhook.module.ts` e registrar em `AppModule`
- [X] T032 [US1] Adicionar handler para `conversation_updated` (agente humano atribuido) em `WebhookService` — quando `assignee` muda para nao-null, chama `conversationsService.setBotActive(id, false)`
- [X] T033 [US1] Adicionar handler para `conversation_status_changed` (status=open) em `WebhookService` — chama `conversationsService.setBotActive(id, true)`

**Checkpoint**: Webhook de texto, audio e imagem processados corretamente. n8n recebe InternalMessage. Segunda entrega descartada silenciosamente.

---

## Phase 4: User Story 2 - Bot Responde via Endpoint (P1)

**Goal**: n8n chama `POST /conversations/:id/messages` -> middleware envia mensagem ao cliente via Chatwoot API usando credenciais corretas do banco.

**Independent Test**: Apos receber InternalMessage do US1, workflow n8n chama endpoint de mensagens. Cliente recebe a mensagem no WhatsApp.

- [X] T034 Criar `src/adapters/chatwoot/chatwoot.adapter.ts` — metodos: `sendMessage(conversationId, content, private, accountConfig)`, `assignTeam(conversationId, teamId, accountConfig)`, `setConversationStatus(conversationId, status, accountConfig)`. Carrega credenciais de `chatwoot_accounts` pelo `account_id`, descriptografa com `APP_SECRET`. Configurar instancia axios com `maxContentLength: 10MB, maxBodyLength: 10MB` (protecao contra decompression bomb)
- [X] T035 [US2] Criar `src/modules/messages/messages.service.ts` — busca conversa no banco local, resolve conta Chatwoot, chama `ChatwootAdapter.sendMessage`. Retorna `{ messageId, status: 'sent' }`
- [X] T036 [US2] Criar `src/modules/messages/messages.controller.ts` — `POST /conversations/:id/messages` com body `{ content, contentType, private? }`. Valida com `class-validator`. Autentica via header `X-Api-Key`. Suporte a `Idempotency-Key` header: se presente, dedup via Redis (`idempotency:{key}` TTL 300s) — retorna resposta cacheada sem reenviar ao Chatwoot
- [X] T037 [US2] Criar `AuthGuard` em `src/common/guards/api-key.guard.ts` — valida `X-Api-Key` contra `MIDDLEWARE_API_KEY` do .env. Aplicar em `MessagesController` e `HandoffController`
- [X] T038 [US2] Criar `src/modules/messages/messages.module.ts` e registrar em `AppModule`

**Checkpoint**: `POST /conversations/45/messages` retorna `{ messageId, status: 'sent' }`. Cliente recebe mensagem. Nota privada (`private: true`) nao vai para o cliente.

---

## Phase 5: User Story 3 - Handoff Bot para Humano (P2)

**Goal**: n8n chama `POST /conversations/:id/handoff` -> Chatwoot recebe atribuicao de time, status vira pending, bot_active=false, evento em handoff_log.

**Independent Test**: Workflow n8n chama endpoint de handoff. Conversa no Chatwoot fica com status pending, time correto atribuido. Bot nao responde mensagens subsequentes.

- [X] T039 [P] [US3] Criar `src/modules/handoff/handoff.service.ts` — valida que teamId ou agentId foi fornecido; chama `ChatwootAdapter.assignTeam` + `setConversationStatus(pending)`; persiste `HandoffLog`; chama `ConversationsService.setBotActive(id, false)`
- [X] T040 [US3] Criar `src/modules/handoff/handoff.controller.ts` — `POST /conversations/:id/handoff` com body `{ teamId?, agentId?, reason? }`. Aplica `ApiKeyGuard`
- [X] T041 [US3] Criar `src/modules/handoff/handoff.module.ts` e registrar em `AppModule`
- [X] T042 [US3] Verificar integracao com handler `conversation_updated` (T032): quando agente humano assume diretamente no Chatwoot (sem passar pelo endpoint), `bot_active` tambem vira false. Adicionar log de handoff com `triggered_by: 'chatwoot_assignee'`

**Checkpoint**: Handoff via n8n funciona. Handoff manual via Chatwoot (agente assume) tambem desativa bot. Registro em handoff_log presente.

---

## Phase 6: User Story 4 - Multiplas Contas sem Restart (P2)

**Goal**: Adicionar nova conta Chatwoot ou inbox via INSERT no banco. Middleware usa credenciais corretas sem restart.

**Independent Test**: Adicionar nova entrada em `chatwoot_accounts` e `inbox_config`. Enviar mensagem pelo novo inbox. Middleware processa sem restart.

- [X] T043 [P] [US4] Adicionar cache LRU (TTL 5 min) em `ChatwootAdapter` para credenciais de conta — `loadAccountConfig(accountId)` busca no banco na primeira vez, depois usa cache. Cache invalida automaticamente por TTL
- [X] T044 [US4] Adicionar cache LRU (TTL 5 min) em `WebhookService` para `InboxConfig` — busca inbox_config no banco, cacheia por `chatwootInboxId`. Reload automatico quando inbox nao encontrado no cache (novo inbox adicionado)
- [ ] T045 [US4] Criar migration de seed: INSERT em `chatwoot_accounts` (account_id=1, base_url=chatwootpainel.infragf.com.br), `bots` (code=atendimento-geral, processor=n8n), `inbox_config` para o inbox existente. Credenciais criptografadas com `APP_SECRET`
- [X] T046 [US4] Criar utilitario `src/common/crypto/encrypt.util.ts` — AES-256-GCM com APP_SECRET. Metodos: `encrypt(text)`, `decrypt(ciphertext)`. Usado em `ChatwootAdapter` e `EvolutionAdapter`

**Checkpoint**: Novo inbox adicionado via SQL sem restart processa mensagens corretamente.

---

## Phase 7: User Story 5 - Contato Criado Automaticamente (P3)

**Goal**: Numero novo cria entrada em `contacts` com phone E.164. Race condition (duas msgs simultaneas do mesmo numero) nao cria duplicata.

**Independent Test**: Numero desconhecido manda mensagem. `contacts` tem entrada com phone E.164. n8n recebe contactId preenchido.

- [X] T047 [P] [US5] Atualizar `ContactsService.upsertContact` para usar Redis distributed lock com chave `contact:lock:{chatwoot_account_id}:{phone}` TTL=15s — previne race condition entre duas mensagens simultaneas do mesmo numero (account_id na chave evita contencao desnecessaria entre contas distintas)
- [X] T048 [US5] Adicionar tratamento de `UniqueConstraintViolation` como fallback no `upsertContact` — se INSERT falhar por UNIQUE, fazer SELECT e retornar registro existente (dupla protecao)

**Checkpoint**: Envio de duas mensagens simultaneas do mesmo numero nao cria dois contatos. Verificado via SQL.

---

## Phase Final: Health, Purge e Polish

**Purpose**: Observabilidade, limpeza e confiabilidade em producao.

- [X] T049 Criar `src/modules/health/health.controller.ts` com `GET /health` usando `@nestjs/terminus` — verifica PostgreSQL (TypeORM ping), Redis (ioredis ping), MinIO (S3 HeadBucket), Chatwoot API (GET /auth/sign_in retorna 200)
- [X] T050 Criar cron job `src/domain/dedup/dedup-purge.service.ts` com `@Cron(CronExpression.EVERY_DAY_AT_3AM)` — DELETE FROM processed_events WHERE created_at < NOW() - INTERVAL 48 HOUR
- [X] T051 [P] Escrever testes unitarios para `normalizer.service.ts` cobrindo: texto, audio, imagem, view_once (url=''), filtros (outgoing, private, grupos) em `tests/unit/normalizer.spec.ts`
- [X] T052 [P] Escrever testes unitarios para `phone.util.ts` cobrindo E.164, numero sem DDI, numero malformado em `tests/unit/phone.util.spec.ts`
- [X] T053 [P] Escrever testes unitarios para `dedup.service.ts` cobrindo primeiro evento (pass) e segundo evento (isDuplicate=true) em `tests/unit/dedup.spec.ts`
- [X] T054 Criar `Dockerfile` e atualizar `docker-compose.dev.yml` para incluir servico `gf-atendimento-api`
- [X] T055 Revisar todos os logs: remover qualquer log que contenha phone, nome de contato, conteudo de mensagem ou URL de midia — usar apenas IDs (conversationId, messageId, contactId)

**Checkpoint final**: `GET /health` retorna 200. Cron de purge configurado. Zero PII em logs.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Sem dependencias — comecar imediatamente
- **Phase 2 (Foundational)**: Depende de Phase 1
- **Phase 3 (US1)**: Depende de Phase 2 — MVP minimo
- **Phase 4 (US2)**: Depende de Phase 2, usa `ChatwootAdapter` de T034 (pode comecar em paralelo com US1 apos T034)
- **Phase 5 (US3)**: Depende de Phase 4 (usa `ChatwootAdapter`) e Phase 3 (usa `ConversationsService`)
- **Phase 6 (US4)**: Depende de Phase 2 — pode comecar em paralelo com US1/US2
- **Phase 7 (US5)**: Depende de Phase 3 (US1 usa upsertContact)
- **Phase Final**: Depende de todas as user stories

### User Story Dependencies

- **US1 (P1)**: Pode comecar apos Phase 2 — sem dependencias em outras stories
- **US2 (P1)**: Pode comecar apos T034 (ChatwootAdapter) — em paralelo com US1
- **US3 (P2)**: Depende de US2 (ChatwootAdapter) e US1 (ConversationsService)
- **US4 (P2)**: Pode comecar apos Phase 2 — em paralelo com US1
- **US5 (P3)**: Depende de US1 (refatora ContactsService)

### Parallel Opportunities

- T008–T015: todas as entities podem ser criadas em paralelo
- T023–T025: PhoneUtil, NormalizerService, MediaResolver — arquivos diferentes, sem dependencias
- T034, T043, T046: ChatwootAdapter, cache, crypto — sem dependencias entre si
- T051–T053: testes unitarios todos em paralelo

---

## Implementation Strategy

### MVP (US1 + US2 apenas)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1 (webhook -> InternalMessage -> n8n)
4. Phase 4: US2 (n8n -> middleware -> Chatwoot)
5. **PARAR E VALIDAR**: loop completo funcionando
6. Colocar em homologacao em um inbox de teste

### Incremental

1. Setup + Foundational → base pronta
2. US1 → n8n recebe mensagens normalizadas → deploy homologacao
3. US2 → bot responde → loop completo → deploy homologacao
4. US3 → handoff funcional → demo para analistas
5. US4 → novo inbox sem restart → operacional
6. US5 → dedup de contatos → producao estavel

---

## Notes

- `synchronize: false` sempre — toda mudanca de schema via migration
- `bot_active` e campo de middleware; nunca confiar em Chatwoot toggle_status bot (retorna 500)
- view_once: `media.url = ''` aplicado NO NORMALIZER antes de qualquer outro passo
- Webhook controller DEVE retornar 200 antes de qualquer await externo (Principio III)
- Seed de dados em migration separada — nao hardcodar credenciais no codigo
