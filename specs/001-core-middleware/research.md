# Research: Core Middleware de Atendimento

**Feature**: 001-core-middleware | **Date**: 2026-05-02

Sem NEEDS CLARIFICATION na spec. Todas as decisoes tecnicas ja foram confirmadas
com o usuario ou derivadas da constituicao. Secoes abaixo documentam rationale
das escolhas-chave para referencia durante implementacao.

---

## Decisao 0: PostgreSQL em vez de MySQL

**Decision**: PostgreSQL 16 + pgvector (imagem `pgvector/pgvector:pg16`) embarcado no Docker
Swarm stack. Connection via `DATABASE_URL`. Backup automatico para MinIO via `docker/backup`.

**Rationale**:
- pgvector habilita RAG/busca semantica sem DB externo adicional (embeddings de conversas,
  base de conhecimento, etc.) — MySQL nao tem equivalente nativo
- Pattern identico ao helen-lms-api (ja testado e operacional na infra Grupo Farias)
- Self-contained: `docker stack deploy` inclui DB + backup, sem dependencia de MySQL externo
- JSONB com indice — melhor que MySQL JSON para payloads de webhook
- TypeORM suporta PostgreSQL identicamente; unica diferenca: driver `pg` em vez de `mysql2`
- uuid vulnerability de TypeORM desaparece em TypeORM 1.0 (usa crypto.randomUUID nativo)

**Alternatives considered**:
- MySQL externo (plano original): dependencia de infra separada, sem pgvector, sem JSONB
- Supabase/Neon: SaaS externo, fora de escopo para infra Docker Swarm self-hosted

**Breaking changes vs MySQL no TypeORM**:
- Tipos: `INT UNSIGNED` → `INTEGER`, `TINYINT(1)` → `BOOLEAN`, `DATETIME` → `TIMESTAMPTZ`
- ENUMs: PostgreSQL native enum type (TypeORM `@Column({ type: 'enum' })`)
- `ON UPDATE CURRENT_TIMESTAMP`: nao existe no PostgreSQL — usar `@UpdateDateColumn()`
- `AUTO_INCREMENT`: usar `@PrimaryGeneratedColumn()` (TypeORM gera SERIAL automaticamente)

---

## Decisao 1: Webhook Async Pattern com Outbox

**Decision**: Handler retorna HTTP 200 imediatamente. Antes de retornar, persiste InternalMessage
na tabela `outbox` (status='pending'). Worker assincrono consome outbox, envia ao n8n e marca
status='sent'. Job de recovery no startup retenta registros 'pending' com mais de 30s.

**Rationale**: Retornar 200 antes de chamar n8n e obrigatorio (Chatwoot timeout ~5s). Porem, sem
persistencia, crash entre o 200 e o POST ao n8n causa perda silenciosa de mensagens — Chatwoot
nao reenviara porque ja recebeu 200. Outbox em PostgreSQL resolve isso sem infra adicional (Redis
BullMQ ou RabbitMQ). Volumes previstos (~50 msg/min) nao justificam fila externa.

**Outbox flow**:
1. Webhook handler: `INSERT INTO outbox (status='pending')` dentro da transaction de processamento
2. Retorna HTTP 200 ao Chatwoot
3. Worker (`setImmediate`): le outbox, POST ao n8n, UPDATE status='sent'
4. Startup: recupera registros 'pending' com `created_at < NOW() - 30s` e retenta

**Alternatives considered**:
- BullMQ/Redis: adiciona dependencia no fluxo critico. PostgreSQL outbox e suficiente e ja na stack.
- Aceitar perda: inaceitavel — mensagem de cliente perdida silenciosamente e incidente de producao.

---

## Decisao 2: Media Resolution via Active Storage Redirect

**Decision**: Chatwoot serve URLs de Active Storage que redirecionam (302) para o objeto MinIO.
Middleware segue o redirect e retorna a URL MinIO direta ao n8n.

**Rationale**: Chatwoot ja usa MinIO (`ACTIVE_STORAGE_SERVICE=s3_compatible`, bucket `chatwoot`).
Arquivos ja residem la. Nao ha duplicacao. URL MinIO e acessivel sem autenticacao (bucket policy
permite leitura publica ou Chatwoot ja configura presigned URL com TTL longo).

**Alternatives considered**:
- Re-upload para MinIO: triplicaria armazenamento. Rejeitado.
- Passar URL Active Storage ao n8n: URL expira ou requer token Chatwoot. Rejeitado.

---

## Decisao 3: Dedup por processed_events (PostgreSQL + UNIQUE constraint)

**Decision**: Tabela `processed_events(source, external_id)` com UNIQUE constraint. Tentativa de
INSERT duplicado lanca erro que e capturado e silenciado. Purge diario via job (48h TTL).

**Rationale**: UNIQUE no banco garante atomicidade mesmo com N replicas do middleware (sem Redis
extra para dedup). FR-004 exige que dedup funcione com multiplas replicas.

**Alternatives considered**:
- Redis SET NX: funciona mas adiciona dependencia ao fluxo critico. MySQL UNIQUE e suficiente
  e ja esta na stack.
- Redis usada para lock de `upsertContact` (race condition diferente) — mantida para esse caso.
  Chave do lock: `upsert:contact:{chatwoot_account_id}:{phone}` (incluir account_id evita
  contencao desnecessaria entre contas distintas com o mesmo numero).

---

## Decisao 4: Credenciais criptografadas no banco

**Decision**: `chatwoot_accounts.api_token` e `evolution_instances.api_key` armazenados criptografados
com AES-256-GCM. Descriptografia on-the-fly em cada chamada.

**Spec de implementacao**:
- Algoritmo: AES-256-GCM (Node.js `crypto.createCipheriv('aes-256-gcm', key, iv)`)
- Chave: `crypto.scryptSync(APP_SECRET, 'gf-atendimento-salt', 32)` — 32 bytes derivados do APP_SECRET
- IV: 12 bytes aleatorios (`crypto.randomBytes(12)`) gerados por registro na hora do INSERT
- Formato armazenado: `{base64url(iv)}:{base64url(ciphertext)}:{base64url(authTag)}` (3 partes separadas por `:`)
- Auth tag: 16 bytes (default GCM)
- Rotacao de chave: sem suporte nesta versao — documentado como limitacao conhecida

**Rationale**: FR-012 exige adicionar nova conta sem restart. Credenciais no .env exigiriam restart
para cada nova conta. DB permite INSERT sem downtime. AES-256-GCM garante confidencialidade e
integridade (auth tag detecta tamper). IV por registro evita reutilizacao de nonce.

**Alternatives considered**:
- HashiCorp Vault / AWS Secrets Manager: infra adicional nao disponivel no Docker Swarm atual.
- Docker Secrets: so funciona para variaveis fixas, nao para N contas dinamicas.
- AES-256-CBC: sem integridade nativa (precisa HMAC separado). GCM preferido.

---

## Decisao 5: bot_active exclusivamente no middleware

**Decision**: Campo `conversations.bot_active` (boolean) gerenciado apenas pelo middleware.
Chatwoot `toggle_status bot` API retorna 500 nesta instancia e nao sera usado.

**Rationale**: Documentado na constituicao. Webhook `conversation_updated` dispara quando agente
assume — middleware processa e seta `bot_active=false`. Webhook `conversation_status_changed`
com `status=open` reativa (`bot_active=true`).

**Alternatives considered**:
- Chatwoot API toggle: quebrado nesta instancia (500). Descartado.
- Flag em Redis: perdida em restart. MySQL e a fonte de verdade.

---

## Decisao 6: Normalizacao de telefone para E.164

**Decision**: Numeros sem prefixo de pais recebem `+55` (Brasil). Normaliza usando regex:
remove caracteres nao numericos, verifica se comeca com 55 + DDD + 8-9 digitos.

**Rationale**: FR-011. Chatwoot pode entregar numero sem `+` ou sem `55`. n8n precisa de formato
consistente para lookups.

**Alternatives considered**:
- libphonenumber: overhead desnecessario para caso Brasil-only desta versao.

---

## Decisao 7: Session key Botpress = `{inboxId}_{contactId}`

**Decision**: Chave de sessao Botpress e `{inboxId}_{contactId}`, nunca `phone` isolado.

**Rationale**: Mesmo contato pode ter sessoes independentes em inboxes diferentes (WhatsApp vs
Webchat vs Instagram). `phone` sozinho confundiria sessoes de canais distintos.

**References**: Documentado na constituicao (Development Workflow).

---

## Decisao 8a: Versoes de dependencias e seguranca (verificado 2026-05-02)

**Decision**: NestJS v11.1.19 (nao v10 como originalmente planejado). TypeORM 0.3.28 stable com
`npm overrides` forcando `uuid@~11.1.1`. Axios configurado com limites de conteudo.

**Rationale**:
- NestJS v11 e o latest estavel; v10 ainda funciona mas v11 tem melhorias de performance e TS.
- TypeORM 0.3.28 tem `npm audit moderate` via uuid (GHSA-w5hq-g745-h8pq). Risco real: ZERO —
  TypeORM usa apenas `uuid.v4()` sem `buf` customizado (o vetor da CVE). uuid v12+ quebra CJS
  (TypeORM e CommonJS); TypeORM 1.0-beta.2 remove uuid mas nao usar beta em producao.
- Axios: `maxContentLength` e `maxBodyLength` ilimitados por padrao — risco de decompression bomb
  se servidor Chatwoot retornar resposta gigante comprimida. Fixar em 10MB no ChatwootAdapter.

**Alternatives considered**:
- TypeORM 1.0.0-beta.2: sem uuid, mas beta. Aguardar stable.
- Forcar uuid@14: remove CJS, TypeORM quebraria. Inviavel.
- Substituir axios por node fetch nativo: sem beneficio suficiente para migrar agora.

---

## Decisao 8: Purge de processed_events

**Decision**: Cron job NestJS (`@Cron`) roda diariamente e deleta registros com `created_at < NOW() - INTERVAL 48 HOUR`.

**Rationale**: FR-014. Retencao de 48h cobre janela de retentativas do Chatwoot (max 24h).
Purge diario evita crescimento ilimitado da tabela.

**Alternatives considered**:
- MySQL Event Scheduler: requer configuracao adicional no servidor. NestJS cron e mais portavel.
- TTL via Redis: dedup usa MySQL UNIQUE, nao Redis. Purge deve ser no mesmo lugar.
