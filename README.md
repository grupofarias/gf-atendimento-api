# gf-atendimento-api

Middleware de atendimento GF. Normaliza mensagens do Chatwoot em um schema `InternalMessage` padronizado e expõe endpoints para o n8n acionar ações no Chatwoot (enviar mensagem, transferir para humano, adicionar labels, etc.).

**Visualização completa da arquitetura e guia de setup do n8n:** abra [`flow.html`](./flow.html) no navegador.

---

## Visão Geral

```
Chatwoot → AgentBot webhook → n8n → POST /normalize → InternalMessage
                                                          ↓
                                              n8n AI Agent (GPT-4o-mini)
                                                          ↓
                                     send_message | handoff | labels | status
                                                          ↓
                                              Chatwoot API (via middleware)
```

O middleware nunca toma decisões de negócio — apenas normaliza dados e delega ao n8n. Toda a lógica de atendimento (bot ativo/inativo, respostas de IA, handoff) vive no workflow n8n.

---

## Stack

| Componente | Tecnologia |
|---|---|
| API | NestJS 11 + TypeScript |
| Banco | PostgreSQL + TypeORM |
| Cache / Dedup | Redis (ioredis) |
| Mídia | MinIO S3 |
| Criptografia | AES-256-GCM |
| Orquestração | n8n (self-hosted) |
| IA | OpenAI GPT-4o-mini via n8n AI Agent |
| Túnel local | loclx (`gfatend.loclx.io`) |

---

## Endpoints principais

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/normalize` | Normaliza payload Chatwoot → InternalMessage |
| `POST` | `/conversations/:id/messages` | Envia mensagem ao Chatwoot |
| `POST` | `/conversations/:id/handoff` | Transfere conversa para agente humano |
| `POST` | `/conversations/:id/labels` | Adiciona/remove labels |
| `POST` | `/conversations/:id/status` | Altera status da conversa |
| `GET` | `/conversations/:id/agents` | Lista agentes disponíveis |
| `GET` | `/health` | Health check |
| `GET` | `/health/ready` | Readiness check |

Todos os endpoints (exceto `/health`) exigem header `x-api-key` com o valor de `MIDDLEWARE_API_KEY`.

---

## Variáveis de ambiente

Copie `.env.example` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `PORT` | Porta da API (padrão: 3200) |
| `APP_SECRET` | Chave AES-256-GCM — gere com `openssl rand -hex 32` |
| `MIDDLEWARE_API_KEY` | Chave compartilhada entre middleware e n8n |
| `DATABASE_URL` | Connection string PostgreSQL |
| `REDIS_HOST` / `REDIS_PORT` | Endereço do Redis |
| `MINIO_*` | Credenciais e endpoint do MinIO |

---

## Rodando localmente

### Com Docker Compose

```bash
# Subir infraestrutura (postgres + redis)
docker compose -f docker-compose.dev.yml up -d

# Rodar migrations
npm run migration:run

# Iniciar em modo watch
npm run start:dev
```

### Sem Docker

Exige PostgreSQL e Redis rodando localmente. Configure `DATABASE_URL` e `REDIS_HOST` no `.env`.

```bash
npm install
npm run migration:run
npm run start:dev
```

A API sobe em `http://localhost:3200`.

---

## Testes

```bash
# Unitários
npm test

# Com coverage
npm run test:cov

# Watch
npm run test:watch
```

---

## Banco de dados

Migrations via TypeORM:

```bash
# Gerar nova migration
npm run migration:generate -- src/database/migrations/NomeDaMigration

# Aplicar
npm run migration:run

# Reverter última
npm run migration:revert
```

Tabelas principais: `chatwoot_accounts`, `inbox_config`, `conversations`, `contacts`, `handoff_log`, `dedup_cache`.

---

## Workflow n8n

O arquivo [`n8n/02-chatwoot-handler.json`](./n8n/02-chatwoot-handler.json) é o workflow de referência, pronto para importar no n8n.

Antes de importar, substitua os placeholders:

| Placeholder | O que colocar |
|---|---|
| `SEU_TUNNEL_URL` | URL pública do middleware (ex: `gfatend.loclx.io`) |
| `SEU_WEBHOOK_PATH_AQUI` | Path do webhook no n8n |
| `SUA_MIDDLEWARE_API_KEY` | Valor de `MIDDLEWARE_API_KEY` do `.env` |
| `SUBSTITUIR_ID_CREDENCIAL_OPENAI` | ID da credencial OpenAI no n8n |
| `SUBSTITUIR_ID_CREDENCIAL_REDIS` | ID da credencial Redis no n8n |

Para instruções passo a passo de como configurar o Chatwoot e o n8n, abra **[`flow.html`](./flow.html)** e acesse a aba **"Setup n8n"**.

---

## Estrutura do projeto

```
src/
├── adapters/          # Clientes externos (Chatwoot, MinIO, Redis)
├── common/            # Guards, interceptors, filtros globais
├── config/            # Configuração de variáveis de ambiente
├── database/          # DataSource, migrations, entidades TypeORM
├── domain/            # Tipos e contratos (InternalMessage, etc.)
└── modules/
    ├── normalize/     # POST /normalize — normalização de payload
    ├── messages/      # Envio de mensagens
    ├── conversations/ # Status, labels
    ├── contacts/      # Dados de contato
    ├── handoff/       # Transferência para humano
    ├── events/        # Eventos internos
    ├── health/        # Health checks
    └── webhook/       # Recepção de webhooks

n8n/
└── 02-chatwoot-handler.json   # Workflow de referência para importar no n8n

specs/
└── 001-core-middleware/       # Spec, plano, contratos e tarefas da feature
```
