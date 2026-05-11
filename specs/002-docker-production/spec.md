# Feature Specification: Deploy Docker em Produção com Banco Persistente

**Feature Branch**: `002-docker-production`
**Created**: 2026-05-11
**Author**: Especialista em Infraestrutura / DevOps
**Status**: Draft
**Depende de**: `001-core-middleware` (aplicação funcional)

---

## Contexto e Motivação

A aplicação `gf-atendimento-api` está funcionalmente completa (~70% da infraestrutura Docker pronta), mas apresenta **7 bloqueios críticos e de alto risco** que impedem um deploy seguro em produção. Um deploy no estado atual resultaria em:

- Container rodando como root (vetor de ataque)
- Schema do banco desatualizado no primeiro deploy (migrations não rodam automaticamente)
- Falhas silenciosas de Redis e MinIO (health check cobre apenas PostgreSQL)
- Segredos gerenciados como variáveis de ambiente em texto plano
- Ausência de separação entre configuração de dev e produção

Esta spec endereça todos esses problemas com soluções graduadas por prioridade.

---

## Diagnóstico Detalhado

### Situação Atual (baseline auditado em 2026-05-11)

| Componente | Estado | Observação |
|---|---|---|
| `Dockerfile` | ⚠️ Incompleto | Multi-stage correto; faltam non-root user e HEALTHCHECK |
| `docker-compose.yml` | ⚠️ Mesclado | Dev e prod no mesmo arquivo; porta 3200 exposta diretamente |
| `.dockerignore` | ✅ Pronto | Cobre `.env*`, `node_modules`, `dist`, arquivos de spec |
| Banco de dados (PostgreSQL) | ✅ Volume persistente | `postgres_data` configurado; TypeORM `synchronize: false` correto |
| Migrations | 🔴 Bloqueio crítico | Não executam automaticamente no startup do container |
| Variáveis de ambiente | ⚠️ Básico | `.env.example` existe; sem `.env.prod.example`; sem validação de `change_me` |
| Health check (endpoint) | ⚠️ Incompleto | `/health` testa apenas PostgreSQL; Redis e MinIO não verificados |
| Health check (Dockerfile) | 🔴 Ausente | Docker não sabe se container está saudável |
| Usuário não-root | 🔴 Ausente | Container roda como root |
| Separação prod/dev | ⚠️ Ausente | `docker-compose.prod.yml` não existe |
| Gestão de segredos | ⚠️ Básico | Env vars em texto plano; sem Docker Secrets |

---

## Problemas Encontrados — Detalhamento por Especialista

### P1 — Migrations não executam no startup (CRÍTICO)

**Diagnóstico técnico**: O `package.json` define o script `migration:run` usando `typeorm-ts-node-commonjs`, que carrega arquivos `.ts` via loader TypeScript. Em produção, o container só possui arquivos compilados (`dist/*.js`). O `CMD` do Dockerfile executa diretamente `node dist/main` sem nenhuma etapa de migration anterior.

**Risco**: No primeiro deploy (ou qualquer deploy que inclua migration nova), o banco fica com schema desatualizado. A aplicação pode iniciar sem erro imediato mas falhar nas primeiras queries que referenciam tabelas/colunas novas.

**Impacto**: Perda de dados em produção, indisponibilidade silenciosa.

**Solução**: Script `docker/entrypoint.sh` que executa migrations contra arquivos `.js` compilados antes de iniciar a aplicação. Adicionar script `migration:run:prod` no `package.json` apontando para `dist/database/data-source.js`.

**Arquivo afetado**: `Dockerfile`, `package.json`, novo `docker/entrypoint.sh`

---

### P2 — Container rodando como root (CRÍTICO)

**Diagnóstico técnico**: O `Dockerfile` não define `USER`. Por padrão, containers Docker rodam como `root (uid=0)`. Se um atacante conseguir explorar uma vulnerabilidade na aplicação Node.js (RCE via dependência comprometida, por exemplo), terá privilégios de root dentro do container — e potencialmente no host se houver misconfiguration de namespaces.

**Risco**: Comprometimento total do host em cenário de escape de container.

**Impacto**: Vetor de ataque OWASP A05 (Security Misconfiguration). Reprovaría qualquer auditoria de segurança.

**Solução**: Criar usuário `nodejs` com uid 1001 no Dockerfile, transferir ownership de `/app`, executar com `USER nodejs`.

**Arquivo afetado**: `Dockerfile`

---

### P3 — Sem HEALTHCHECK no Dockerfile (ALTO)

**Diagnóstico técnico**: Sem `HEALTHCHECK`, o Docker Engine não tem como distinguir um container que iniciou com sucesso de um que iniciou mas está em estado falho (ex: crash loop, porta não aberta, banco inacessível). O orquestrador (`docker-compose`, Swarm) reporta o container como `running` mesmo quando a aplicação está morta internamente.

**Risco**: Tráfego enviado para instâncias mortas sem failover automático.

**Solução**: `HEALTHCHECK` no Dockerfile apontando para `GET /health`. Já existe o endpoint — só falta o Dockerfile saber disso.

**Arquivo afetado**: `Dockerfile`

---

### P4 — Health check cobre apenas PostgreSQL (ALTO)

**Diagnóstico técnico**: `health.controller.ts` verifica apenas `this.db.pingCheck('postgresql')`. Redis e MinIO são dependências críticas:
- Redis: cache de eventos processados (prevenção de duplicatas). Sem Redis, eventos podem ser processados em duplicata.
- MinIO: armazenamento de URLs de mídia. Sem MinIO, qualquer mensagem com arquivo resulta em erro 500.

**Risco**: Falhas em Redis ou MinIO são invisíveis via `/health`, impedindo detecção proativa e failover.

**Solução**: Adicionar checks de Redis (`RedisHealthIndicator`) e MinIO (HTTP check no endpoint do MinIO) ao `HealthCheckService`.

**Arquivo afetado**: `src/modules/health/health.controller.ts`, `src/modules/health/health.module.ts`

---

### P5 — Dev e prod no mesmo docker-compose (ALTO)

**Diagnóstico técnico**: O `docker-compose.yml` atual expõe a porta `3200` diretamente no host e não define `resource limits`. Em produção:
- Porta exposta diretamente = bypass do reverse proxy (Nginx/Traefik), perdendo SSL, rate limiting e WAF.
- Sem resource limits = um memory leak ou spike de tráfego pode derrubar o host inteiro.

**Risco**: Superfície de ataque desnecessária, ausência de proteção por TLS direta na API, possível OOM no host.

**Solução**: Criar `docker-compose.prod.yml` com overrides de produção: sem `ports` expostas externamente (usar rede interna + reverse proxy), com `deploy.resources.limits`, logging driver adequado.

**Arquivo afetado**: Novo `docker-compose.prod.yml`

---

### P6 — Gestão de segredos em texto plano (ALTO)

**Diagnóstico técnico**: `APP_SECRET` e `MIDDLEWARE_API_KEY` são passados como variáveis de ambiente em texto plano via `.env`. Isso significa que:
- Qualquer processo filho herda os segredos.
- `docker inspect <container>` lista os env vars (incluindo segredos) para qualquer usuário com acesso ao Docker socket.
- Logs acidentais de env vars expõem segredos.

**Risco**: Vazamento de credenciais via acesso administrativo ao host Docker ou inspeção de container.

**Solução de curto prazo**: Documentar geração segura dos segredos, adicionar validação que rejeita valores `change_me` em `NODE_ENV=production`.

**Solução de médio prazo**: Migrar para Docker Secrets (Swarm) ou integração com HashiCorp Vault / AWS Secrets Manager.

**Arquivo afetado**: `src/config/configuration.ts`, `docker-compose.prod.yml`, novo `.env.prod.example`

---

### P7 — Migration path mismatch em produção (ALTO)

**Diagnóstico técnico**:
- `data-source.ts:31` → `migrations: ['src/database/migrations/*.ts']` (path de desenvolvimento)
- `app.module.ts:47` → `migrations: ['dist/database/migrations/*.js']` (path de produção — correto para runtime)

O `data-source.ts` é usado pela CLI do TypeORM. Se a CLI for chamada em produção apontando para `data-source.ts`, tentará carregar arquivos `.ts` que não existem no container (só há `.js` compilados). Resultado: `migration:run` falha silenciosamente ou com erro de módulo não encontrado.

**Solução**: Criar `data-source.prod.ts` (ou `data-source.js` compilado) que aponta para `dist/database/migrations/*.js` e usar esse arquivo no `migration:run:prod`.

**Arquivo afetado**: `src/database/data-source.ts`, `package.json`, `docker/entrypoint.sh`

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Primeiro deploy em produção funciona sem intervenção manual (P1)

Um desenvolvedor executa `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d` em um servidor limpo (banco vazio). O sistema deve detectar que o schema não existe, executar todas as migrations em ordem, e subir a aplicação — sem necessidade de comandos manuais adicionais.

**Why this priority**: Sem isso, todo deploy requer SSH no servidor para rodar migrations manualmente. Operação frágil e não reproduzível.

**Independent Test**: Criar container com banco vazio. Executar deploy. Verificar via `docker logs` que migrations rodaram. Verificar que `GET /health` retorna 200.

**Acceptance Scenarios**:

1. **Given** servidor com banco PostgreSQL vazio,
   **When** `docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento` é executado,
   **Then** logs mostram `migrations executed successfully`, aplicação sobe, `GET /health` retorna `{ status: 'ok' }` com HTTP 200.

2. **Given** deploy com migration nova adicionada,
   **When** `docker stack deploy` é re-executado,
   **Then** apenas a migration nova é executada (TypeORM rastreia via tabela `migrations`), aplicação sobe sem erro.

3. **Given** migration com SQL inválido,
   **When** `docker stack deploy` é executado,
   **Then** entrypoint falha com exit code não-zero, container não sobe. O arquivo de migration que falhou é revertido (PostgreSQL faz rollback da transação da migration). Migrations anteriores já commitadas permanecem. Para rollback completo, usar `migration:revert` manualmente.

---

### User Story 2 — Falhas de dependências são detectadas proativamente (P2)

Um operador monitora o endpoint `/health` via uptime checker. Quando o Redis cai, o health check deve refletir degradação imediatamente — antes que os primeiros usuários sejam impactados por eventos duplicados.

**Why this priority**: Monitoramento reativo (usuário reporta problema) é inaceitável em sistema de atendimento ao cliente.

**Acceptance Scenarios**:

1. **Given** Redis indisponível,
   **When** `GET /health` é chamado,
   **Then** resposta HTTP 503 com body `{ status: 'error', redis: 'down' }`.

2. **Given** MinIO indisponível,
   **When** `GET /health` é chamado,
   **Then** resposta HTTP 503 com body `{ status: 'error', minio: 'down' }`.

3. **Given** todas as dependências saudáveis,
   **When** `GET /health` é chamado,
   **Then** resposta HTTP 200 com `{ status: 'ok', postgresql: 'up', redis: 'up', minio: 'up', chatwoot: 'up' }`.

4. **Given** Chatwoot API indisponível (endpoint base não responde),
   **When** `GET /health` é chamado,
   **Then** resposta HTTP 503 com body contendo `{ chatwoot: { status: 'down' } }`.

> **Referência de constituição**: Princípio VI — "`/health` endpoint MUST verify connectivity to PostgreSQL, MinIO, Redis, and Chatwoot API."

---

### User Story 3 — Container não roda como root (P1 — Segurança)

Um auditor de segurança executa `docker inspect gf-atendimento-api` e verifica o uid do processo principal. O processo deve rodar com uid não-zero.

**Acceptance Scenarios**:

1. **Given** container em execução,
   **When** `docker exec <id> id` é executado,
   **Then** output mostra `uid=1001(nodejs)`, não `uid=0(root)`.

2. **Given** tentativa de escrita em `/etc/` dentro do container,
   **Then** operação falha com `Permission denied`.

---

### User Story 4 — Restart automático em caso de crash (P2)

A aplicação crasha por erro não tratado. O Docker deve detectar o estado inválido e reiniciar o container automaticamente — sem intervenção humana.

**Acceptance Scenarios**:

1. **Given** container com HEALTHCHECK configurado,
   **When** aplicação para de responder em `/health` por 3 tentativas consecutivas,
   **Then** Docker marca container como `unhealthy` e o orquestrador reinicia.

2. **Given** container reiniciado,
   **When** banco está acessível,
   **Then** migrations são verificadas (TypeORM pula as já executadas) e aplicação volta ao ar em < 30s.

---

## Solução Proposta — Arquitetura

```
gf-atendimento-api/
├── Dockerfile                    # MODIFICAR: non-root user + HEALTHCHECK
├── docker-compose.yml            # MANTER: base (dev-friendly)
├── docker-compose.prod.yml       # CRIAR: overrides de produção
├── .env.example                  # MANTER
├── .env.prod.example             # CRIAR: template específico de prod
├── docker/
│   └── entrypoint.sh             # CRIAR: migrations + startup
├── package.json                  # MODIFICAR: script migration:run:prod
└── src/
    ├── database/
    │   ├── data-source.ts        # MANTER: para dev/CLI
    │   └── data-source.prod.ts   # CRIAR: aponta para dist/*.js
    └── modules/
        └── health/
            └── health.controller.ts  # MODIFICAR: add Redis + MinIO checks
```

---

## Requisitos Não-Funcionais

| Requisito | Métrica | Solução |
|---|---|---|
| Startup time | < 60s incluindo migrations | Entrypoint com timeout configurável |
| Recovery time | < 30s após crash | HEALTHCHECK + restart policy |
| Segurança | Processo não-root | uid=1001 no Dockerfile |
| Observabilidade | 100% das dependências no `/health` | PostgreSQL + Redis + MinIO |
| Reprodutibilidade | Deploy idempotente | Migrations versionadas pelo TypeORM |
| Separação de ambientes | Zero configuração de dev vazando em prod | `docker-compose.prod.yml` com overrides |

---

## Fora do Escopo desta Spec

- Configuração de Nginx/Traefik como reverse proxy (infra externa)
- Integração com HashiCorp Vault ou AWS Secrets Manager (médio prazo)
- Kubernetes / Helm charts
- CI/CD pipeline (GitHub Actions / GitLab CI)
- Configuração de backup do MinIO (já existe serviço no compose atual)
- Monitoramento APM (Datadog, New Relic)

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migration falha no primeiro deploy | Média | Alto | Testar em ambiente staging com banco vazio antes de prod |
| `uid=1001` conflita com permissões de volume | Baixa | Médio | `chown -R nodejs:nodejs /app` no Dockerfile |
| MinIO health check aumenta latência do `/health` | Baixa | Baixo | Timeout de 2s no check; falha não bloqueia outras checks |
| Operador copia `.env.example` sem trocar segredos | Alta | Crítico | Validação em `configuration.ts` rejeita valores `change_me` em `NODE_ENV=production` |

---

## Critérios de Aceite Global

- [ ] `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d` funciona em servidor limpo sem comandos adicionais
- [ ] `docker exec <id> id` retorna `uid=1001(nodejs)`
- [ ] `GET /health` retorna 200 com PostgreSQL, Redis e MinIO verificados
- [ ] `GET /health` retorna 503 quando qualquer dependência está down
- [ ] `docker inspect <id>` mostra HEALTHCHECK configurado
- [ ] Novo deploy com migration adicional não requer intervenção manual
- [ ] `.env.example` com valor `change_me` em `NODE_ENV=production` → aplicação recusa iniciar com mensagem clara
- [ ] `docker-compose.prod.yml` não expõe porta 3200 diretamente no host
