# Runbook: Deploy Docker em Produção

## Pré-requisitos

- Docker Swarm inicializado no servidor (`docker swarm init`)
- Arquivo `.env` criado a partir de `.env.prod.example` com segredos reais
- Imagem buildada e disponível (local ou registry)

---

## Primeiro Deploy (servidor limpo)

```sh
# 1. Build da imagem
npm run build
docker build -t gf-atendimento-api:prod .

# 2. Deploy no Swarm
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento

# 3. Verificar logs de migrations
docker service logs gf-atendimento_api 2>&1 | grep -i "migration\|entrypoint\|error"

# 4. Verificar health (porta não exposta no host — usar exec)
CONTAINER=$(docker ps -q --filter name=gf-atendimento_api)
docker exec "$CONTAINER" wget -qO- http://localhost:3200/health | jq .
```

---

## Re-deploy com Nova Migration

```sh
# Mesmos comandos — migrations novas são executadas automaticamente.
# TypeORM pula as já executadas (rastreia via tabela `typeorm_migrations`).
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml gf-atendimento
```

---

## Rollback de Migration

```sh
# Revertir a última migration executada
DATABASE_URL=<valor_do_.env> npm run migration:revert

# Para reverter múltiplas: repetir o comando (TypeORM reverte uma por vez)
```

**Atenção**: rollback de migration pode causar perda de dados se a migration criou colunas com dados. Sempre faça backup antes.

---

## Rotação do APP_SECRET

O `APP_SECRET` é usado para criptografia AES-256-GCM de credenciais no banco de dados.

**Trocar o `APP_SECRET` invalida todos os dados criptografados.** Procedimento:

1. Descriptografar todos os registros sensíveis com o secret atual
2. Substituir `APP_SECRET` no `.env` com novo valor (`openssl rand -hex 32`)
3. Re-criptografar os registros com o novo secret
4. Re-deploy

Não existe rotação automática implementada. Contate a equipe de desenvolvimento.

---

## Verificação de Saúde Pós-Deploy

```sh
CONTAINER=$(docker ps -q --filter name=gf-atendimento_api)

# Health check completo
docker exec "$CONTAINER" wget -qO- http://localhost:3200/health | jq .
# Esperado: { status: 'ok', info: { postgresql: {...}, redis: {...}, minio: {...}, chatwoot: {...} } }

# Status do serviço no Swarm
docker service ps gf-atendimento_api
# CURRENT STATE deve mostrar "Running X minutes ago (healthy)"

# HEALTHCHECK configurado
docker service inspect gf-atendimento_api | jq '.[].Spec.TaskTemplate.ContainerSpec.Healthcheck'

# Usuário não-root
docker exec "$CONTAINER" id
# Esperado: uid=1001(nodejs) gid=1001(nodejs)
```

---

## Monitoramento do Purge Job

O serviço `purge` deleta `processed_events` com mais de 48h diariamente.

```sh
# Ver logs do purge
docker service logs gf-atendimento_purge

# Verificar que está rodando
docker service ps gf-atendimento_purge
```

---

## Configurar Conta Chatwoot (Admin)

Acesse `http://<HOST>:3200/admin` com a `MIDDLEWARE_API_KEY` do `.env`.

Adicione a conta Chatwoot com:
- **Account ID**: número visível na URL do Chatwoot (`/app/accounts/**1**/...`)
- **Base URL**: `https://chatwoot.seudominio.com.br`
- **API Token**: Perfil → Tokens de Acesso no Chatwoot

Não é necessário configurar Inboxes — o middleware identifica conta e canal automaticamente pelo payload do webhook.

---

## Remover Stack (Teardown)

```sh
docker stack rm gf-atendimento
# Nota: volumes (postgres_data) são preservados
```
