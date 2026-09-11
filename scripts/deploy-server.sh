#!/usr/bin/env bash
# Interactive server deploy — run ON the VPS after artifacts are synced.
# Bind-mounts prebuilt artifacts; secrets come from deploy/.env (not compose).
#
#   cd /root/ecommerce && bash scripts/deploy-server.sh
# Non-interactive (from laptop remote-run):
#   ECOMM_NONINTERACTIVE=1 ECOMM_MODE=2 bash scripts/deploy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$ROOT/deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/server-deploy-$TIMESTAMP.log"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)
STARTED_AT="$(date +%s)"
ENV_FILE="$ROOT/deploy/.env"

log() {
  local line
  line="[$(date '+%H:%M:%S')] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  log "Recent log excerpt:"
  tail -n 60 "$LOG_FILE" 2>/dev/null | while read -r l; do printf '  %s\n' "$l"; done
  log "Full log: $LOG_FILE"
  exit 1
}

elapsed() { echo "$(( $(date +%s) - STARTED_AT ))s"; }

prompt() {
  local reply
  if [[ -n "${ECOMM_NONINTERACTIVE:-}" ]]; then
    echo "${2:-}"
    return 0
  fi
  if [[ -n "${2:-}" ]]; then
    read -r -p "$1 [$2]: " reply || true
    echo "${reply:-$2}"
  else
    read -r -p "$1: " reply || true
    echo "$reply"
  fi
}

confirm() {
  if [[ -n "${ECOMM_NONINTERACTIVE:-}" ]]; then
    log "Non-interactive: auto-confirm ($1)"
    return 0
  fi
  local ans
  ans="$(prompt "${1:-Proceed?}" "Y")"
  case "$ans" in
    Y|y|yes|YES) return 0 ;;
    *) log "Aborted."; exit 0 ;;
  esac
}

run_long() {
  local label="$1"
  shift
  log "START: $label"
  log "CMD: $*"
  "$@" > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2) &
  local pid=$!
  local n=0
  while kill -0 "$pid" 2>/dev/null; do
    n=$((n + 1))
    if (( n % 2 == 0 )); then
      log "... still running: $label (${n}x5s, total $(elapsed))"
    fi
    sleep 5
  done
  if ! wait "$pid"; then
    log "FAIL: $label after $(elapsed)"
    return 1
  fi
  log "DONE: $label ($(elapsed) elapsed)"
  return 0
}

must_long() {
  run_long "$@" || fail "FAIL: $1"
}

load_env() {
  [[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE — sync deploy/.env from the laptop"
  # Strip UTF-8 BOM and only export KEY=VAL lines (never bash-source comments).
  local tmp
  tmp="$(mktemp)"
  sed '1s/^\xEF\xBB\xBF//' "$ENV_FILE" | while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    printf '%s\n' "$line"
  done >"$tmp"
  set -a
  # shellcheck disable=SC1090
  source "$tmp"
  set +a
  rm -f "$tmp"
  FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-3082}"
  BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-8082}"
  MINIO_HOST_PORT="${MINIO_HOST_PORT:-9002}"
  FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-ecommerce.oduor-arnold.com}"
  API_DOMAIN="${API_DOMAIN:-ecomm-api.oduor-arnold.com}"
  POSTGRES_USER="${POSTGRES_USER:-ecommerce}"
  POSTGRES_DB="${POSTGRES_DB:-ecommerce}"
  MINIO_BUCKET="${MINIO_BUCKET:-ecommerce}"
  log "Env loaded: FE=:$FRONTEND_HOST_PORT BE=:$BACKEND_HOST_PORT MINIO=:$MINIO_HOST_PORT"
  log "Domains: $FRONTEND_DOMAIN / $API_DOMAIN"
}

ensure_swap() {
  log "Checking swap..."
  local swap_kb
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  local swap_gb=$((swap_kb / 1024 / 1024))
  if (( swap_kb >= 1500000 )); then
    log "Swap adequate (~${swap_gb}Gi) — skipping swapfile creation"
    swapon --show || true
    return 0
  fi
  log "Swap below ~1.5GB — creating /swapfile-ecomm (2G)"
  if [[ -f /swapfile-ecomm ]]; then
    sudo swapon /swapfile-ecomm 2>/dev/null || true
    return 0
  fi
  run_long "fallocate 2G swap" sudo fallocate -l 2G /swapfile-ecomm
  sudo chmod 600 /swapfile-ecomm
  sudo mkswap /swapfile-ecomm
  sudo swapon /swapfile-ecomm
  if ! grep -q '/swapfile-ecomm' /etc/fstab; then
    echo '/swapfile-ecomm none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
  swapon --show
  free -h | tee -a "$LOG_FILE"
}

check_artifacts() {
  if [[ ! -f "$ROOT/deploy/artifacts/frontend/server.js" && -f "$ROOT/deploy/artifacts/frontend.tar.gz" ]]; then
    log "Extracting frontend.tar.gz"
    rm -rf "$ROOT/deploy/artifacts/frontend"
    tar -C "$ROOT/deploy/artifacts" -xzf "$ROOT/deploy/artifacts/frontend.tar.gz"
  fi
  [[ -f "$ROOT/deploy/artifacts/api" ]] || fail "Missing deploy/artifacts/api"
  [[ -f "$ROOT/deploy/artifacts/frontend/server.js" ]] || fail "Missing deploy/artifacts/frontend/server.js"
  [[ -f "$ROOT/deploy/docker-compose.prod.yml" ]] || fail "Missing deploy/docker-compose.prod.yml"
  [[ -d "$ROOT/db/migrations" ]] || fail "Missing db/migrations"
  chmod +x "$ROOT/deploy/artifacts/api"
  log "Artifacts present"
  ls -lh "$ROOT/deploy/artifacts/api" | tee -a "$LOG_FILE"
  du -sh "$ROOT/deploy/artifacts/frontend" | tee -a "$LOG_FILE"
}

check_ports() {
  log "Checking host ports..."
  local port owne
  for port in 80 443 "$FRONTEND_HOST_PORT" "$BACKEND_HOST_PORT" "$MINIO_HOST_PORT"; do
    owner="$(ss -tulpn 2>/dev/null | awk -v p=":$port" '$5 ~ p"$" {print; exit}')"
    if [[ -z "$owner" ]]; then
      log "  :$port free"
      continue
    fi
    case "$port" in
      80|443)
        if echo "$owner" | grep -qiE 'nginx|LISTEN'; then
          log "  :$port in use (nginx/expected): ok"
        else
          fail "Port $port in use by unexpected process: $owner"
        fi
        ;;
      *)
        if echo "$owner" | grep -qiE 'docker|ecommerce|LISTEN'; then
          log "  :$port already bound — will recreate containers if ours"
        else
          fail "Port $port blocked: $owner"
        fi
        ;;
    esac
  done
}

prune_disk_if_needed() {
  local avail_kb
  avail_kb="$(df -Pk / | awk 'NR==2{print $4}')"
  log "Disk free: $(df -h / | awk 'NR==2{print $4}') (${avail_kb}KB)"
  if (( avail_kb < 2500000 )); then
    log "Low disk (<2.5G free) — pruning unused docker data"
    run_long "docker builder prune" docker builder prune -af || true
    run_long "docker image prune" docker image prune -af || true
  else
    log "Disk OK — light dangling prune"
    docker image prune -f 2>/dev/null | tee -a "$LOG_FILE" || true
    docker builder prune -f 2>/dev/null | tee -a "$LOG_FILE" || true
  fi
  df -h / | tee -a "$LOG_FILE" || true
  docker system df 2>/dev/null | tee -a "$LOG_FILE" || true
}

compose_up() {
  log "Starting stack (bind-mounted artifacts — skip heavy image rebuilds)"
  pushd "$ROOT/deploy" >/dev/null

  if ! docker image inspect ecommerce-backend:runtime >/dev/null 2>&1; then
    log "Building one-time backend runtime base (alpine + CA certs)"
    export BUILDKIT_MAX_PARALLELISM=1
    must_long "docker compose build backend" "${COMPOSE[@]}" build backend
  else
    log "Backend runtime image already present — skip build"
  fi

  if ! docker image inspect node:22-alpine >/dev/null 2>&1; then
    must_long "docker pull node:22-alpine" docker pull node:22-alpine
  fi

  must_long "docker compose up" "${COMPOSE[@]}" up -d --remove-orphans
  must_long "recreate app containers" "${COMPOSE[@]}" up -d --force-recreate --no-deps backend frontend
  popd >/dev/null
  log "Waiting for containers..."
  local i
  for i in $(seq 1 48); do
    if curl -fsS "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:${FRONTEND_HOST_PORT}/" >/dev/null 2>&1; then
      log "Local containers responding after ~$((i * 5))s"
      return 0
    fi
    log "... waiting for app readiness ($i/48)"
    if (( i % 6 == 0 )); then
      (cd "$ROOT/deploy" && "${COMPOSE[@]}" ps) | tee -a "$LOG_FILE" || true
      (cd "$ROOT/deploy" && "${COMPOSE[@]}" logs --tail=30 backend frontend) | tee -a "$LOG_FILE" || true
    fi
    sleep 5
  done
  (cd "$ROOT/deploy" && "${COMPOSE[@]}" ps) | tee -a "$LOG_FILE" || true
  (cd "$ROOT/deploy" && "${COMPOSE[@]}" logs --tail=80 backend frontend postgres flyway) | tee -a "$LOG_FILE" || true
  fail "Containers did not become ready in time"
}

run_seed() {
  local seed="$ROOT/db/seed.sql"
  [[ -f "$seed" ]] || fail "Missing db/seed.sql — sync it from the laptop"
  log "Loading demo seed data into postgres ($seed)"
  local i
  for i in $(seq 1 30); do
    if (cd "$ROOT/deploy" && "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB") >/dev/null 2>&1; then
      break
    fi
    log "... waiting for postgres ($i/30)"
    sleep 2
  done
  log "START: db seed"
  if ! (cd "$ROOT/deploy" && "${COMPOSE[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1) <"$seed" \
      > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2); then
    fail "db seed failed — see $LOG_FILE"
  fi
  log "DONE: db seed ($(elapsed) elapsed)"
}

render_nginx() {
  local fe_tmpl="$ROOT/deploy/nginx/frontend.conf.template"
  local api_tmpl="$ROOT/deploy/nginx/api.conf.template"
  local fe_out="$ROOT/deploy/nginx/$FRONTEND_DOMAIN"
  local api_out="$ROOT/deploy/nginx/$API_DOMAIN"
  [[ -f "$fe_tmpl" && -f "$api_tmpl" ]] || fail "Missing nginx templates under deploy/nginx/"

  sed -e "s/__FRONTEND_DOMAIN__/${FRONTEND_DOMAIN}/g" \
      -e "s/__FRONTEND_HOST_PORT__/${FRONTEND_HOST_PORT}/g" \
      "$fe_tmpl" >"$fe_out"
  sed -e "s/__API_DOMAIN__/${API_DOMAIN}/g" \
      -e "s/__BACKEND_HOST_PORT__/${BACKEND_HOST_PORT}/g" \
      -e "s/__MINIO_HOST_PORT__/${MINIO_HOST_PORT}/g" \
      -e "s/__MINIO_BUCKET__/${MINIO_BUCKET}/g" \
      "$api_tmpl" >"$api_out"
  log "Rendered nginx: $fe_out + $api_out"
}

install_nginx() {
  render_nginx
  log "Installing/updating nginx site configs"
  local src_fe="$ROOT/deploy/nginx/$FRONTEND_DOMAIN"
  local src_api="$ROOT/deploy/nginx/$API_DOMAIN"
  [[ -f "$src_fe" && -f "$src_api" ]] || fail "Missing rendered nginx configs"

  if [[ ! -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" ]]; then
    sudo cp "$src_fe" "/etc/nginx/sites-available/$FRONTEND_DOMAIN"
  else
    log "Cert exists for $FRONTEND_DOMAIN — leaving SSL blocks; refreshing proxy if needed"
    if [[ ! -f "/etc/nginx/sites-available/$FRONTEND_DOMAIN" ]]; then
      sudo cp "$src_fe" "/etc/nginx/sites-available/$FRONTEND_DOMAIN"
    fi
  fi
  if [[ ! -d "/etc/letsencrypt/live/$API_DOMAIN" ]]; then
    sudo cp "$src_api" "/etc/nginx/sites-available/$API_DOMAIN"
  else
    log "Cert exists for $API_DOMAIN — leaving SSL blocks"
    if [[ ! -f "/etc/nginx/sites-available/$API_DOMAIN" ]]; then
      sudo cp "$src_api" "/etc/nginx/sites-available/$API_DOMAIN"
    fi
  fi

  ensure_proxy_pass "/etc/nginx/sites-available/$FRONTEND_DOMAIN" "http://127.0.0.1:${FRONTEND_HOST_PORT}"
  ensure_proxy_pass "/etc/nginx/sites-available/$API_DOMAIN" "http://127.0.0.1:${BACKEND_HOST_PORT}"

  sudo ln -sfn "/etc/nginx/sites-available/$FRONTEND_DOMAIN" "/etc/nginx/sites-enabled/$FRONTEND_DOMAIN"
  sudo ln -sfn "/etc/nginx/sites-available/$API_DOMAIN" "/etc/nginx/sites-enabled/$API_DOMAIN"

  must_long "nginx -t" sudo nginx -t
  must_long "nginx reload" sudo systemctl reload nginx
}

ensure_proxy_pass() {
  local file="$1"
  local target="$2"
  if ! sudo grep -q "$target" "$file" 2>/dev/null; then
    log "Updating proxy_pass in $file → $target"
    if [[ "$file" == *"$FRONTEND_DOMAIN"* ]]; then
      sudo cp "$ROOT/deploy/nginx/$FRONTEND_DOMAIN" "$file"
    else
      sudo cp "$ROOT/deploy/nginx/$API_DOMAIN" "$file"
    fi
  fi
}

ensure_certs() {
  if [[ -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" && -d "/etc/letsencrypt/live/$API_DOMAIN" ]]; then
    log "TLS certs already present for both domains"
    return 0
  fi
  if [[ -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" ]]; then
    log "TLS cert present for $FRONTEND_DOMAIN"
    return 0
  fi
  local email
  email="$(prompt "Email for Let's Encrypt" "admin@${FRONTEND_DOMAIN#*.}")"
  log "Requesting certs via certbot (nginx plugin)"
  if ! run_long "certbot" sudo certbot --nginx \
    -d "$FRONTEND_DOMAIN" \
    -d "$API_DOMAIN" \
    --non-interactive --agree-tos -m "$email" --redirect; then
    log "WARN: certbot failed (often DNS). Continuing with HTTP-only."
    log "WARN: Point A records for $FRONTEND_DOMAIN and $API_DOMAIN → this server, then re-run option 3."
    return 0
  fi
}

health_checks() {
  log "=== Health checks ==="
  local ok=0 failc=0

  check_one() {
    local name="$1" url="$2"
    if curl -fsSL --max-time 20 -o /tmp/ecomm-health.out -w "%{http_code}" "$url" | tee /tmp/ecomm-health.code | grep -qE '^(200|301|302)$'; then
      log "PASS  $name  ($url)  HTTP $(cat /tmp/ecomm-health.code)"
      ok=$((ok + 1))
    else
      log "FAIL  $name  ($url)  HTTP $(cat /tmp/ecomm-health.code 2>/dev/null || echo '?')"
      failc=$((failc + 1))
    fi
  }

  check_one "frontend-local" "http://127.0.0.1:${FRONTEND_HOST_PORT}/"
  check_one "api-local" "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories"

  if sudo test -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN"; then
    check_one "frontend-public" "https://${FRONTEND_DOMAIN}/"
    check_one "api-public" "https://${API_DOMAIN}/api/catalog/categories"
  else
    log "SKIP  public HTTPS (no TLS cert yet)"
    if curl -fsS --max-time 20 -H "Host: ${FRONTEND_DOMAIN}" "http://127.0.0.1/" >/dev/null; then
      log "PASS  frontend-nginx-http  (Host: ${FRONTEND_DOMAIN})"
      ok=$((ok + 1))
    else
      log "FAIL  frontend-nginx-http"
      failc=$((failc + 1))
    fi
    if curl -fsS --max-time 20 -H "Host: ${API_DOMAIN}" "http://127.0.0.1/api/catalog/categories" >/dev/null; then
      log "PASS  api-nginx-http  (Host: ${API_DOMAIN})"
      ok=$((ok + 1))
    else
      log "FAIL  api-nginx-http"
      failc=$((failc + 1))
    fi
  fi

  log "docker compose ps:"
  (cd "$ROOT/deploy" && "${COMPOSE[@]}" ps) | tee -a "$LOG_FILE"

  log "Summary: $ok passed, $failc failed"
  if (( failc > 0 )); then
    fail "One or more health checks failed"
  fi
  log "ALL HEALTH CHECKS PASSED"
}

# ── Menu ────────────────────────────────────────────────────────────
load_env

echo
echo "Ecommerce server deploy"
echo "  root: $ROOT"
echo "  log:  $LOG_FILE"
echo "  host: $(hostname) ports FE=${FRONTEND_HOST_PORT} BE=${BACKEND_HOST_PORT}"
echo
echo "  1) Full: swap + ports + compose up + seed + nginx/ssl + health  [default]"
echo "  2) Compose only (restart containers + seed)"
echo "  3) Nginx + certbot only"
echo "  4) Health checks only"
echo "  5) Seed database only"
echo

MODE="${ECOMM_MODE:-}"
if [[ -z "$MODE" ]]; then
  MODE="$(prompt "Choice" "1")"
fi
log "Menu choice: $MODE"

echo
echo "Plan:"
case "$MODE" in
  1|"") echo "  • ensure swap"
        echo "  • verify ports"
        echo "  • docker compose up (bind-mount + recreate app)"
        echo "  • load db/seed.sql"
        echo "  • nginx + certbot"
        echo "  • health checks"
        echo "  • prune_disk_if_needed" ;;
  2) echo "  • docker compose up (bind-mount + recreate app)"
     echo "  • load db/seed.sql"
     echo "  • local smoke"
     echo "  • prune_disk_if_needed" ;;
  3) echo "  • nginx configs + certbot" ;;
  4) echo "  • health checks only" ;;
  5) echo "  • load db/seed.sql into postgres" ;;
  *) fail "Invalid choice: $MODE" ;;
esac
echo
confirm "Run this deploy?"

command -v docker >/dev/null || fail "docker not installed"
command -v curl >/dev/null || fail "curl not installed"

case "$MODE" in
  1|"")
    ensure_swap
    check_artifacts
    check_ports
    compose_up
    run_seed
    install_nginx
    ensure_certs
    health_checks
    log "Post-deploy prune..."
    prune_disk_if_needed
    ;;
  2)
    check_artifacts
    check_ports
    compose_up
    run_seed
    log "Local smoke:"
    curl -fsS "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories" >/dev/null \
      && log "PASS api-local" || fail "api-local failed"
    curl -fsS "http://127.0.0.1:${FRONTEND_HOST_PORT}/" >/dev/null \
      && log "PASS frontend-local" || fail "frontend-local failed"
    log "Post-deploy prune..."
    prune_disk_if_needed
    ;;
  3)
    install_nginx
    ensure_certs
    ;;
  4)
    health_checks
    ;;
  5)
    run_seed
    ;;
esac

log "Server deploy finished OK"
echo
echo "Log: $LOG_FILE"
