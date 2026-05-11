#!/bin/bash
# update-chatwoot.sh — upgrade incremental Chatwoot (Docker Swarm), um passo por vez
# Duas stacks separadas: chatwoot_admin e chatwoot_sidekiq
#
# Uso:
#   ./update-chatwoot.sh          — avança uma versão (detecta atual pelo YAML)
#   ./update-chatwoot.sh v4.13.0  — pula direto para versão específica

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────
ADMIN_STACK="chatwoot_admin"
SIDEKIQ_STACK="chatwoot_sidekiq"
SERVICE_ADMIN="${ADMIN_STACK}_chatwoot_admin"     # ajuste se necessário
SERVICE_SIDEKIQ="${SIDEKIQ_STACK}_chatwoot_sidekiq"  # ajuste se necessário
IMAGE_BASE="chatwoot/chatwoot"
COMPOSE_ADMIN="/root/chatwoot_admin.yaml"         # ajuste para seu caminho real
COMPOSE_SIDEKIQ="/root/chatwoot_sidekiq.yaml"     # ajuste para seu caminho real
LOG_DIR="/root/upgrade-logs/chatwoot"

mkdir -p "$LOG_DIR"

# ─── Sequência oficial de versões ──────────────────────────────────────────────
VERSIONS=(
  "v4.10.0"
  "v4.10.1"
  "v4.11.0"
  "v4.11.1"
  "v4.11.2"
  "v4.12.0"
  "v4.12.1"
  "v4.13.0"
)

# ─── Helpers ───────────────────────────────────────────────────────────────────
ERRORS=0
LOG_FILE=""

_log() {
  local level="$1" msg="$2" ts
  ts=$(date '+%H:%M:%S')
  echo "${ts} [${level}] ${msg}"
  [[ -n "$LOG_FILE" ]] && echo "- \`${ts}\` **[${level}]** ${msg}" >> "$LOG_FILE"
}
log_info()  { _log "INFO" "$1"; }
log_ok()    { _log "OK"   "$1"; }
log_err()   { _log "ERRO" "$1"; ERRORS=$((ERRORS + 1)); }

log_block() {
  local title="$1" content="$2"
  [[ -n "$LOG_FILE" ]] && printf '\n### %s\n```\n%s\n```\n\n' "$title" "$content" >> "$LOG_FILE"
}

get_current_version() {
  grep -oP "(?<=${IMAGE_BASE}:)v[\d.]+" "$COMPOSE_ADMIN" | head -1
}

get_next_version() {
  local current="$1" found=0
  for v in "${VERSIONS[@]}"; do
    [[ "$found" -eq 1 ]] && { echo "$v"; return; }
    [[ "$v" = "$current" ]] && found=1
  done
  [[ "$found" -eq 0 ]] && echo "${VERSIONS[0]}"
}

wait_stable() {
  local service="$1" max_wait=180 elapsed=0
  log_info "Aguardando estabilização: $service"
  while true; do
    local replicas running desired
    replicas=$(docker service ls --filter "name=${service}" --format "{{.Replicas}}" 2>/dev/null)
    running=$(echo "$replicas" | cut -d/ -f1)
    desired=$(echo "$replicas" | cut -d/ -f2)
    if [[ -n "$running" && "$running" = "$desired" && "$desired" != "0" ]]; then
      log_ok "${service}: ${running}/${desired} réplicas OK"
      return 0
    fi
    if [[ "$elapsed" -ge "$max_wait" ]]; then
      log_err "Timeout ${service} após ${elapsed}s (${running}/${desired})"
      return 1
    fi
    sleep 10
    elapsed=$((elapsed + 10))
    echo "  ... ${running:-?}/${desired:-?} (${elapsed}s)"
  done
}

run_in_admin() {
  local container
  container=$(docker ps --filter "name=${SERVICE_ADMIN}" --format "{{.ID}}" | head -1)
  [[ -z "$container" ]] && { log_err "Nenhum container do admin encontrado"; return 1; }
  docker exec "$container" "$@"
}

update_yaml_tag() {
  local file="$1" from="$2" to="$3" ts="$4"
  cp "${file}" "${file}.bak.${ts}"
  sed -i "s|${IMAGE_BASE}:${from}|${IMAGE_BASE}:${to}|g" "$file"
  if grep -q "${IMAGE_BASE}:${to}" "$file"; then
    log_ok "YAML atualizado: $file"
  else
    log_err "Falha ao atualizar tag em $file — restaurando backup"
    cp "${file}.bak.${ts}" "$file"
    return 1
  fi
}

deploy_stack() {
  local stack="$1" compose="$2"
  log_info "docker stack deploy: $stack"
  local out
  if ! out=$(docker stack deploy --prune --resolve-image always -c "$compose" "$stack" 2>&1); then
    log_err "deploy falhou: $stack"
    log_block "Erro no deploy ($stack)" "$out"
    return 1
  fi
  log_ok "Stack deploy OK: $stack"
  log_block "Saída deploy ($stack)" "$out"
}

# ─── Validação inicial ─────────────────────────────────────────────────────────
for f in "$COMPOSE_ADMIN" "$COMPOSE_SIDEKIQ"; do
  [[ ! -f "$f" ]] && { echo "ERRO: arquivo não encontrado: $f"; exit 1; }
done

# ─── Determina versões ─────────────────────────────────────────────────────────
CURRENT=$(get_current_version)
[[ -z "$CURRENT" ]] && { echo "ERRO: versão atual não detectada em $COMPOSE_ADMIN"; exit 1; }

if [[ -n "${1:-}" ]]; then
  TARGET="${1:-}"
  [[ "$TARGET" != v* ]] && TARGET="v${TARGET}"
else
  TARGET=$(get_next_version "$CURRENT")
fi

[[ -z "$TARGET" ]] && { echo "✓ Já está na última versão da sequência: $CURRENT"; exit 0; }
[[ "$TARGET" = "$CURRENT" ]] && { echo "✓ Já está na versão $CURRENT"; exit 0; }

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/${TARGET}_${TIMESTAMP}.md"

cat > "$LOG_FILE" << EOF
# Upgrade Chatwoot: ${CURRENT} → ${TARGET}

- **Data:** $(date '+%Y-%m-%d %H:%M:%S')
- **Imagem:** ${IMAGE_BASE}:${TARGET}
- **Admin stack:** ${ADMIN_STACK}
- **Sidekiq stack:** ${SIDEKIQ_STACK}

## Etapas

EOF

echo ""
echo "════════════════════════════════════════════"
echo "  Versão atual  : ${CURRENT}"
echo "  Próxima versão: ${TARGET}"
echo "  Log           : ${LOG_FILE}"
echo "════════════════════════════════════════════"
echo ""
read -rp "Confirma? [s/N] " confirm
[[ "$confirm" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

# ─── 1. Pull da imagem ─────────────────────────────────────────────────────────
FULL_IMAGE="${IMAGE_BASE}:${TARGET}"
log_info "Pulling ${FULL_IMAGE}..."
if ! pull_out=$(docker pull "$FULL_IMAGE" 2>&1); then
  log_err "docker pull falhou — imagem não encontrada"
  log_block "Erro no pull" "$pull_out"
  echo "ERRO: $FULL_IMAGE não encontrada. Abortado."
  exit 1
fi
log_ok "Pull concluído"

# ─── 2. Atualiza YAMLs ────────────────────────────────────────────────────────
update_yaml_tag "$COMPOSE_ADMIN"   "$CURRENT" "$TARGET" "$TIMESTAMP"
update_yaml_tag "$COMPOSE_SIDEKIQ" "$CURRENT" "$TARGET" "$TIMESTAMP"

# ─── 3. Deploy admin ──────────────────────────────────────────────────────────
deploy_stack "$ADMIN_STACK" "$COMPOSE_ADMIN"
sleep 20
wait_stable "$SERVICE_ADMIN"

# ─── 4. Migrations ────────────────────────────────────────────────────────────
log_info "Rodando db:migrate..."
if ! migrate_out=$(run_in_admin bundle exec rails db:migrate RAILS_ENV=production 2>&1); then
  log_err "db:migrate falhou"
  log_block "Erro db:migrate" "$migrate_out"
else
  log_ok "db:migrate OK"
  log_block "Saída db:migrate" "$migrate_out"
fi

# ─── 5. Deploy sidekiq ────────────────────────────────────────────────────────
deploy_stack "$SIDEKIQ_STACK" "$COMPOSE_SIDEKIQ"
sleep 15
wait_stable "$SERVICE_SIDEKIQ"

# ─── 6. Logs de boot ──────────────────────────────────────────────────────────
sleep 5
container=$(docker ps --filter "name=${SERVICE_ADMIN}" --format "{{.ID}}" | head -1)
[[ -n "$container" ]] && log_block "Logs admin (últimas 30 linhas)" \
  "$(docker logs "$container" --tail 30 2>&1)"

# ─── Resultado final ───────────────────────────────────────────────────────────
echo "" >> "$LOG_FILE"
if [[ "$ERRORS" -eq 0 ]]; then
  echo "## Resultado: ✅ SUCESSO — ${CURRENT} → ${TARGET}" >> "$LOG_FILE"
  echo ""
  echo "✅  ${CURRENT} → ${TARGET} OK"
  echo "📄  Log: ${LOG_FILE}"
  echo "💾  Backups: ${COMPOSE_ADMIN}.bak.${TIMESTAMP}"
  echo "           ${COMPOSE_SIDEKIQ}.bak.${TIMESTAMP}"
  echo ""
  echo "Teste o sistema e rode ./update-chatwoot.sh para avançar para a próxima versão."
else
  echo "## Resultado: ❌ FALHA (${ERRORS} erro(s)) — ${CURRENT} → ${TARGET}" >> "$LOG_FILE"
  echo ""
  echo "❌  Upgrade com ${ERRORS} erro(s). Verifique: ${LOG_FILE}"
  echo "💾  Backups dos YAMLs preservados (.bak.${TIMESTAMP})"
  exit 1
fi

echo "=== Services ===" && docker service ls | grep -i chatwoot
echo "=== Containers ===" && docker ps --filter "name=chatwoot" --format "table {{.Names}}\t{{.Status}}"
