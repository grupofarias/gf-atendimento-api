---
description: "Task list for Docker Production Deploy with Persistent Database"
feature: "002-docker-production"
spec: "specs/002-docker-production/spec.md"
generated: "2026-05-11"
revised: "2026-05-11 (post red-team)"
---

# Tasks: Deploy Docker em Produção com Banco Persistente

**Spec**: `specs/002-docker-production/spec.md`
**Stack**: NestJS + TypeORM + PostgreSQL + Redis + MinIO + Docker Swarm

> **Nota de deploy**: Constituição define Docker Swarm. Usar `docker stack deploy` — não `docker-compose up`. `deploy.resources.limits` e `depends_on` só funcionam em Swarm. Ver H1 do red-team.

## Organização por User Story

| Story | Prioridade | Título |
|---|---|---|
| US1 | P1 | Deploy sem intervenção manual (migrations automáticas) |
| US3 | P1 | Container não roda como root |
| US2 | P2 | Falhas de dependências detectadas proativamente (incl. Chatwoot) |
| US4 | P2 | Restart automático em caso de crash |

---

## Phase 1: Setup (Nenhuma — projeto já existe)

> Projeto existente. Prosseguir para Phase 2.

---

## Phase 2: Foundational (Pré-requisitos bloqueantes)

**Purpose**: Infraestrutura compartilhada que US1 e outras dependem. Deve completar antes de qualquer story.

- [ ] T001 Criar `src/database/data-source.prod.ts`: mesmas entidades do `data-source.ts` dev (importadas explicitamente como classes, não glob), `migrations: ['dist/database/migrations/*.js']`, sem `dotenv.config()` (env já disponível no container), sem `typeorm-ts-node-commonjs`
- [ ] T002 Adicionar script `"migration:run:prod"` em `package.json`: `"node_modules/.bin/typeorm -d dist/database/data-source.prod.js migration:run"` — usar `node_modules/.bin/typeorm` (binário JS puro, não o ts-node-commonjs); verificar que o binário existe em `node_modules/.bin/` após `npm ci --omit=dev`
- [ ] T003 [P] Criar diretório `docker/` na raiz do projeto

**Checkpoint**: `data-source.prod.ts` existe, `migration:run:prod` aponta para `dist/` e usa binário correto, diretório `docker/` criado.

---

## Phase 3: User Story 1 — Deploy sem intervenção manual (P1) 🎯 MVP

**Goal**: `docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento` num servidor limpo deve aguardar PostgreSQL, rodar migrations e subir a aplicação sem comandos manuais.

**Independent Test**: Container com banco vazio → `docker stack deploy` → `docker service logs gf-atendimento_api` mostra migrations executadas → `docker exec <container> wget -qO- http://localhost:3200/health` retorna 200.

**Depende de**: T001, T002, T003 (Phase 2)

- [ ] T004 [US1] Criar `docker/entrypoint.sh` com o seguinte conteúdo exato:
  ```sh
  #!/bin/sh
  set -e

  echo "[entrypoint] Aguardando PostgreSQL..."
  until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -q; do
    echo "[entrypoint] PostgreSQL indisponível, tentando em 2s..."
    sleep 2
  done

  echo "[entrypoint] Executando migrations..."
  node ./node_modules/.bin/typeorm -d dist/database/data-source.prod.js migration:run

  echo "[entrypoint] Iniciando aplicação..."
  exec node dist/main
  ```
  — `pg_isready` está disponível na imagem `node:20-alpine` via pacote `postgresql-client`; se não, substituir por loop TCP com `nc -z`; `exec node dist/main` garante que Node.js é PID 1 para receber SIGTERM corretamente

- [ ] T004a [US1] Adicionar `RUN apk add --no-cache postgresql-client` no stage `runner` do `Dockerfile` para disponibilizar `pg_isready` (alternativa sem pacote: usar loop `nc -z ${DB_HOST} ${DB_PORT}` no entrypoint — decidir e manter consistência)

- [ ] T005 [US1] Atualizar `Dockerfile` stage `runner` com a seguinte ordem de instruções (ordem é crítica):
  ```dockerfile
  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production

  # 1. Dependências de runtime
  RUN apk add --no-cache postgresql-client
  RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

  # 2. Pacotes npm (antes de copiar código — melhor cache)
  COPY package*.json ./
  RUN npm ci --omit=dev --ignore-scripts

  # 3. Código compilado + entrypoint
  COPY --from=builder /app/dist ./dist
  COPY docker/ docker/

  # 4. Permissões (ainda como root — após todos os COPYs)
  RUN chmod +x /app/docker/entrypoint.sh && chown -R nodejs:nodejs /app

  # 5. Troca de usuário (deve ser ÚLTIMA instrução antes de HEALTHCHECK/ENTRYPOINT)
  USER nodejs

  EXPOSE 3200
  ENTRYPOINT ["/app/docker/entrypoint.sh"]
  ```
  — Substituir o Dockerfile inteiro pelo conteúdo acima (stage builder permanece inalterado)

- [ ] T006 [P] [US1] Criar `docker-compose.prod.yml` com overrides de produção para Swarm:
  ```yaml
  version: '3.8'
  services:
    api:
      # Remove port binding — acesso via rede interna + reverse proxy
      ports: []
      deploy:
        replicas: 2
        resources:
          limits:
            cpus: '1'
            memory: 1G
          reservations:
            cpus: '0.25'
            memory: 256M
        restart_policy:
          condition: on-failure
          delay: 5s
          max_attempts: 3
        update_config:
          parallelism: 1
          delay: 10s
          order: start-first
      logging:
        driver: json-file
        options:
          max-size: '10m'
          max-file: '3'
      environment:
        - DB_HOST=postgres
        - DB_PORT=5432
        - DB_USER=postgres
  ```
  — `deploy.resources.limits` funciona apenas com `docker stack deploy` (Swarm); silenciosamente ignorado por `docker-compose up`

- [ ] T006b [P] [US1] Adicionar serviço `purge` ao `docker-compose.prod.yml` para deletar eventos processados com mais de 48h (constituição: "Must be scheduled at deploy time"):
  ```yaml
    purge:
      image: postgres:16-alpine
      command: >
        sh -c "while true; do
          psql $$DATABASE_URL -c \"DELETE FROM processed_events WHERE created_at < NOW() - INTERVAL '48 hours'\";
          sleep 86400;
        done"
      env_file: .env
      networks:
        - backend
      deploy:
        replicas: 1
        restart_policy:
          condition: any
  ```

- [ ] T007 [P] [US1] Criar `.env.prod.example` com todos os vars obrigatórios para produção, comentários indicando como gerar segredos (`openssl rand -hex 32`), e aviso explícito "NUNCA use os valores de .env.example em produção"

- [ ] T008 [US1] Verificar que `data-source.prod.ts` compila: `npm run build` → confirmar `dist/database/data-source.prod.js` gerado sem erros de TypeScript

**Verificação manual desta story**:
```sh
# Inicializar Swarm (se não inicializado)
docker swarm init

# Deploy limpo
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento

# Verificar logs de migrations
docker service logs gf-atendimento_api 2>&1 | grep -i "migration\|entrypoint\|error"

# Health check via exec (porta não exposta no host)
CONTAINER=$(docker ps -q --filter name=gf-atendimento_api)
docker exec "$CONTAINER" wget -qO- http://localhost:3200/health | jq .

# Limpar
docker stack rm gf-atendimento
```

---

## Phase 4: User Story 3 — Container não roda como root (P1 — Segurança)

**Goal**: Processo principal roda com `uid=1001` (usuário `nodejs`).

**Independent Test**: `docker exec <id> id` → `uid=1001(nodejs)`.

**Depende de**: T005 (Dockerfile já reescrito com user nodejs incluído)

- [ ] T009 [US3] Verificar que o Dockerfile do T005 está correto: `docker build -t gf-atendimento-api:test .` → `docker run --rm gf-atendimento-api:test id` → output deve ser `uid=1001(nodejs) gid=1001(nodejs)`
- [ ] T010 [US3] Verificar que `docker/entrypoint.sh` (T004) não contém comandos que requerem root (`chown`, `apk add`, `chmod`) — esses estão no Dockerfile (build time), não no entrypoint (runtime)

**Verificação manual**:
```sh
docker build -t gf-atendimento-api:test .
docker run --rm gf-atendimento-api:test id
# Esperado: uid=1001(nodejs) gid=1001(nodejs) groups=1001(nodejs)

docker run --rm gf-atendimento-api:test touch /etc/test 2>&1
# Esperado: touch: /etc/test: Permission denied
```

---

## Phase 5: User Story 2 — Falhas de dependências detectadas proativamente (P2)

**Goal**: `GET /health` retorna 503 imediatamente quando qualquer dependência (PostgreSQL, Redis, MinIO, Chatwoot API) está indisponível.

**Independent Test**: Parar cada dependência individualmente → `docker exec <id> wget -qO- http://localhost:3200/health` → 503 com campo correto em error.

**Sem dependência de outras stories** (modifica apenas `health.module.ts` e `health.controller.ts`).

> **Constituição Princípio VI**: `/health` MUST verify PostgreSQL, MinIO, Redis, **and Chatwoot API**.

- [ ] T011 [US2] Criar `src/modules/health/indicators/redis.health.ts`: implementar `RedisHealthIndicator` extendendo `HealthIndicator` do `@nestjs/terminus`, injetando o `ioredis` client existente (já disponível via módulo Redis do projeto), chamar `client.ping()` com timeout de 2s, retornar `this.getStatus('redis', isHealthy)` — **não usar** `MicroserviceHealthIndicator` (requer `@nestjs/microservices` ausente no projeto)

- [ ] T012 [US2] Atualizar `src/modules/health/health.module.ts`: importar `RedisHealthIndicator` (T011), importar `HttpModule` (para MinIO e Chatwoot via `HttpHealthIndicator`), injetar `ConfigService` para acessar `REDIS_HOST`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `CHATWOOT_BASE_URL`

- [ ] T013 [US2] Atualizar `src/modules/health/health.controller.ts`: adicionar ao array do `HealthCheckService.check()`:
  - **Redis**: `() => this.redisHealth.check('redis')` (usando indicador customizado do T011)
  - **MinIO**: `() => this.http.pingCheck('minio', \`${MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${MINIO_ENDPOINT}:${MINIO_PORT}/minio/health/live\`, { timeout: 2000 })` — URL usa HTTPS quando `MINIO_USE_SSL=true`
  - **Chatwoot**: `() => this.http.pingCheck('chatwoot', \`${CHATWOOT_BASE_URL}/auth/sign_in\`, { timeout: 3000 })` — verificar apenas conectividade HTTP (qualquer resposta ≠ connection error = up)

- [ ] T014 [P] [US2] Atualizar `@ApiResponse` do `health.controller.ts` para refletir os 4 serviços no schema de exemplo: `{ status: 'ok', info: { postgresql: {status:'up'}, redis: {status:'up'}, minio: {status:'up'}, chatwoot: {status:'up'} } }`

**Verificação manual**:
```sh
CONTAINER=$(docker ps -q --filter name=gf-atendimento_api)

# Todos up
docker exec "$CONTAINER" wget -qO- http://localhost:3200/health | jq .

# Redis down
docker service scale gf-atendimento_redis=0
docker exec "$CONTAINER" wget -qO- http://localhost:3200/health; echo "exit: $?"
docker service scale gf-atendimento_redis=1

# MinIO down — parar o serviço MinIO e testar
# Chatwoot API down — bloquear a URL e testar
```

---

## Phase 6: User Story 4 — Restart automático em caso de crash (P2)

**Goal**: Docker Swarm detecta container em estado falho via HEALTHCHECK e reinicia automaticamente.

**Independent Test**: `docker service inspect gf-atendimento_api | jq '.[].Spec.TaskTemplate.ContainerSpec.Healthcheck'` — mostra comando configurado. `docker ps` mostra `(healthy)`.

**Depende de**: T005 (Dockerfile já reescrito com USER nodejs)

- [ ] T015 [US4] Adicionar `HEALTHCHECK` no `Dockerfile` stage `runner`, logo após `USER nodejs` e antes de `ENTRYPOINT` (já posicionado corretamente no Dockerfile do T005 — adicionar se não estiver):
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3200/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
  ```
  — `start-period=60s`: PostgreSQL cold start + migrations em banco vazio pode levar 20-40s; `60s` garante margem. Ajustar se T016 medir tempo diferente.

- [ ] T016 [US4] Medir tempo de startup com banco vazio:
  ```sh
  docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento
  docker service logs -f gf-atendimento_api 2>&1 | grep -E "migration|Application is running" | ts '%H:%M:%.S'
  ```
  Registrar duração no comentário do `docker-compose.prod.yml` (ex: `# start-period=60s: migrations levam ~18s em banco vazio`). Ajustar `start-period` se necessário.

- [ ] T017 [US4] Confirmar `restart_policy` no `docker-compose.prod.yml` (T006): `condition: on-failure`, `max_attempts: 3`, `delay: 5s` — verificar que está na seção `deploy`, não no nível raiz do serviço (nível raiz é ignorado pelo Swarm)

**Verificação manual**:
```sh
docker service inspect gf-atendimento_api \
  | jq '.[].Spec.TaskTemplate.ContainerSpec.Healthcheck'
# Deve retornar o HEALTHCHECK configurado

docker service ps gf-atendimento_api
# Coluna CURRENT STATE deve mostrar "Running X minutes ago (healthy)"
```

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Adicionar validação em `src/config/configuration.ts`: se `NODE_ENV === 'production'` e qualquer variável crítica (`APP_SECRET`, `MIDDLEWARE_API_KEY`) contém substring `change_me` ou `change-me`, lançar erro em `validateSync()` com mensagem: `"APP_SECRET contém valor padrão inseguro. Gere com: openssl rand -hex 32"`
- [ ] T019 Executar smoke test completo e validar todos os critérios de aceite da spec:
  ```sh
  # Build
  npm run build
  docker build -t gf-atendimento-api:prod .

  # Deploy em Swarm
  docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento

  # Validar critérios de aceite
  CONTAINER=$(docker ps -q --filter name=gf-atendimento_api)

  # CA1: health retorna 200 com todos os checks
  docker exec "$CONTAINER" wget -qO- http://localhost:3200/health | jq '{status, services: (.info | keys)}'

  # CA2: não-root
  docker exec "$CONTAINER" id

  # CA3: porta 3200 não exposta no host
  curl http://localhost:3200/health 2>&1 | grep -c "refused"  # deve ser 1

  # CA4: HEALTHCHECK configurado
  docker service inspect gf-atendimento_api | jq '.[].Spec.TaskTemplate.ContainerSpec.Healthcheck'

  # CA5: change_me validation
  NODE_ENV=production APP_SECRET=change_me npm run start 2>&1 | grep "valor padrão"
  ```
- [ ] T020 [P] Criar `specs/002-docker-production/runbook.md` com: primeiro deploy (comandos exatos), rollback de migration (`migration:revert`), rotação de `APP_SECRET` (impacto em dados criptografados), verificação de saúde pós-deploy, purge job monitoring

---

## Dependências entre Stories

```
Phase 2 (Foundational)
   T001 → T002 → T003

US1 (P1) — depende de Phase 2
   T004 → T004a → T005 (Dockerfile completo)
   T006 [P] → T006b
   T007 [P]
   T008 (verifica build)

US3 (P1) — depende de T005 (Dockerfile já inclui non-root)
   T009 → T010

US4 (P2) — depende de T005 (Dockerfile estável)
   T015 → T016 → T017

US2 (P2) — independente de US1/US3/US4 (arquivos diferentes)
   T011 → T012 → T013 → T014 [P]

Polish — depende de todas as stories
   T018 [P], T020 [P]
   T019 (smoke test — roda por último)
```

---

## Paralelismo

```
Desenvolvedor A: Phase 2 → US1 → US3 → US4  (Dockerfile + infra)
Desenvolvedor B: US2 (health module — independente)
```

Dentro de US1: T006, T007 são paralelas entre si.
No Polish: T018, T020 são paralelas entre si (T019 bloqueia até ambas concluírem).

---

## MVP Sugerido

Phase 2 + US1 + US3: migrations automáticas + non-root + banco persistente. Aplicação segura e deployável.
US2 + US4: observabilidade e resiliência — necessários antes de qualquer carga de produção real.

---

## Critérios de Aceite Global

- [ ] `docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento` funciona em servidor limpo sem comandos adicionais
- [ ] `docker exec <id> id` retorna `uid=1001(nodejs)`
- [ ] `GET /health` (via exec) retorna 200 com PostgreSQL, Redis, MinIO e Chatwoot verificados
- [ ] `GET /health` retorna 503 quando qualquer dependência está down
- [ ] `docker service inspect` mostra HEALTHCHECK configurado
- [ ] Novo deploy com migration adicional não requer intervenção manual
- [ ] Valor `change_me` em `NODE_ENV=production` → app recusa iniciar com mensagem clara
- [ ] Porta 3200 não acessível diretamente do host
- [ ] `processed_events` purge job rodando como serviço no Swarm

---

## Contagem

| Fase | Tasks | Paralelas |
|---|---|---|
| Phase 2 (Foundational) | 3 | 1 |
| US1 | 7 | 3 |
| US3 | 2 | 0 |
| US2 | 4 | 1 |
| US4 | 3 | 0 |
| Polish | 3 | 2 |
| **Total** | **22** | **7** |
