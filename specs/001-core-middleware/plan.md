# Implementation Plan: Core Middleware de Atendimento

**Branch**: `001-core-middleware` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-core-middleware/spec.md`

## Summary

Middleware NestJS que recebe webhooks do Chatwoot, normaliza mensagens de qualquer canal para
`InternalMessage`, resolve URLs de mídia para MinIO direto, deduplica por `message.id`, e
encaminha ao n8n. Expoe endpoints REST para o n8n enviar respostas, executar handoff e gerenciar
estado de conversa. Credenciais de todas as contas Chatwoot e instancias Evolution ficam no banco
criptografadas — adicionar nova conta nao requer restart.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.x
**Primary Dependencies**: NestJS 11.1.19, TypeORM 0.3.28 + pg, ioredis 5.10.1, @aws-sdk/client-s3 3.1041.0, axios 1.15.2
**Storage**: PostgreSQL 16 + pgvector via TypeORM (synchronize: false — migrations only). Embedded no Docker stack. Backup automatico para MinIO via docker/backup service.
**Testing**: Jest (unit) + Supertest (integration)
**Target Platform**: Linux server, Docker Swarm
**Project Type**: web-service (REST API + webhook receiver)
**Performance Goals**: InternalMessage entregue ao n8n em < 2 segundos (SC-001). Handoff em < 3s (SC-004).
**Constraints**: Webhook handler retorna HTTP 200 antes de qualquer IO externo (Principio III). Zero duplicatas no n8n (SC-002). view_once URL nunca em log/payload (Principio IV).
**Scale/Scope**: 29+ agentes, N contas Chatwoot, N instancias Evolution

## Constitution Check

*GATE: Deve passar antes da Phase 0. Re-verificar apos Phase 1.*

| Principio | Status | Observacao |
|-----------|--------|------------|
| I. Domain-First: tipos de plataforma nao vazam para alem do adapter | PASS | Adapters em `src/adapters/`, domain em `src/domain/` |
| II. Platform-Agnostic Contracts: toda comunicacao inter-modulo usa InternalMessage | PASS | Normalizer converte antes de qualquer domain service |
| III. Async Webhook Handling (NON-NEGOTIABLE): 200 antes de IO externo | PASS | Handler enfileira processamento e retorna 200 imediatamente |
| IV. Privacy by Design: view_once URL = '' antes de qualquer log | PASS | Normalizer aplica antes de qualquer passo |
| V. Credentials in DB: credenciais em chatwoot_accounts / evolution_instances | PASS | Apenas variaveis de infra no .env |
| VI. Observability: logs com conversationId + messageId, /health endpoint | PASS | Interceptor global injeta contexto; FR-013 |
| VII. Safe Rollout: corte inbox-por-inbox | PASS | InboxConfig por inbox; migracao gradual |

**Resultado**: PASS. Sem violacoes.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-middleware/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── webhook-payload.md
│   ├── internal-message.md
│   └── rest-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app.module.ts
├── main.ts
│
├── config/
│   └── configuration.ts          # .env loader + validacao com class-validator
│
├── database/
│   ├── entities/                 # TypeORM entities
│   │   ├── chatwoot-account.entity.ts
│   │   ├── evolution-instance.entity.ts
│   │   ├── inbox-config.entity.ts
│   │   ├── bot.entity.ts
│   │   ├── contact.entity.ts
│   │   ├── conversation.entity.ts
│   │   ├── handoff-log.entity.ts
│   │   └── processed-event.entity.ts
│   └── migrations/               # Nunca synchronize: true
│
├── domain/
│   ├── normalize/
│   │   ├── normalizer.service.ts    # Chatwoot webhook -> InternalMessage
│   │   └── phone.util.ts            # E.164 normalization
│   ├── dedup/
│   │   └── dedup.service.ts         # processed_events + Redis lock
│   ├── media/
│   │   └── media-resolver.service.ts  # Active Storage redirect -> MinIO URL
│   └── types/
│       └── internal-message.type.ts  # InternalMessage interface
│
├── adapters/
│   ├── chatwoot/
│   │   └── chatwoot.adapter.ts     # Chatwoot REST API calls
│   ├── evolution/
│   │   └── evolution.adapter.ts    # Evolution API calls (future)
│   ├── n8n/
│   │   └── n8n.adapter.ts          # Encaminha InternalMessage ao webhook n8n
│   └── minio/
│       └── minio.adapter.ts        # URL resolution via S3 client
│
└── modules/
    ├── webhook/
    │   ├── webhook.module.ts
    │   ├── webhook.controller.ts   # POST /webhooks/chatwoot
    │   └── webhook.service.ts      # Orquestra: filter -> dedup -> normalize -> media -> forward
    ├── messages/
    │   ├── messages.module.ts
    │   ├── messages.controller.ts  # POST /conversations/:id/messages
    │   └── messages.service.ts
    ├── handoff/
    │   ├── handoff.module.ts
    │   ├── handoff.controller.ts   # POST /conversations/:id/handoff
    │   └── handoff.service.ts
    ├── contacts/
    │   ├── contacts.module.ts
    │   └── contacts.service.ts     # upsertContact com Redis lock
    ├── conversations/
    │   ├── conversations.module.ts
    │   └── conversations.service.ts  # bot_active, conversation state
    └── health/
        ├── health.module.ts
        └── health.controller.ts    # GET /health

tests/
├── unit/
│   ├── normalizer.spec.ts
│   ├── dedup.spec.ts
│   ├── media-resolver.spec.ts
│   └── phone.util.spec.ts
└── integration/
    ├── webhook.spec.ts
    ├── messages.spec.ts
    └── handoff.spec.ts
```

**Structure Decision**: NestJS modular. `domain/` contem logica de negocio pura (sem imports de adapters). `adapters/` contem chamadas a plataformas externas. `modules/` orquestra domain + adapters via injecao de dependencia. Separacao garante Principio I e II da constituicao.

## Complexity Tracking

Sem violacoes da constituicao. Tabela omitida.
