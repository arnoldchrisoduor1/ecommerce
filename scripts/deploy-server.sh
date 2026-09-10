#!/usr/bin/env bash
# Interactive server deploy — run ON the VPS after artifacts are synced.
# No compiles here: docker compose only COPY prebuilt artifacts into images.
#
#   cd ~/ecommerce && bash scripts/deploy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$ROOT/deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/server-deploy-$TIMESTAMP.log"
# Compose file lives in deploy/; run from that directory so build context stays small.
COMPOSE=(docker compose -f docker-compose.prod.yml)
STARTED_AT="$(date +%s)"

FRONTEND_HOST_PORT=3080
BACKEND_HOST_PORT=8081
MINIO_HOST_PORT=9000
FRONTEND_DOMAIN="ecommerce.oduor-arnold.com"
API_DOMAIN="ecomm-api.oduor-arnold.com"

log() {
  local line
  line="[$(date '+%H:%M:%S')] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  log "Recent log excerpt:"
  tail -n 40 "$LOG_FILE" 2>/dev/null | while read -r l; do printf '  %s\n' "$l"; done
  log "Full log: $LOG_FILE"
  exit 1
}

elapsed() { echo "$(( $(date +%s) - STARTED_AT ))s"; }

prompt() {
  local reply
  if [[ -n "${2:-}" ]]; then
    read -r -p "$1 [$2]: " reply || true
    echo "${reply:-$2}"
  else
    read -r -p "$1: " reply || true
    echo "$reply"
  fi
}

confirm() {
  local ans
  ans="$(prompt "${1:-Proceed?}" "Y")"
  case "$ans" in
    Y|y|yes|YES) return 0 ;;
    *) log "Aborted."; exit 0 ;;
  esac
}

# Long command with heartbeat (stdout/stderr still flow to console + log).
# Returns child exit code (does not abort the script).
run_long() {
  local label="$1"
  shift
  log "START: $label"
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


ensure_swap() {
  log "Checking swap..."
  local swap_kb
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  local swap_gb=$((swap_kb / 1024 / 1024))
  if (( swap_kb >= 5000000 )); then
    log "Swap adequate (~${swap_gb}Gi) — skipping swapfile creation"
    swapon --show || true
    return 0
  fi
  log "Swap below ~5GB — creating /swapfile-ecomm (5G)"
  if [[ -f /swapfile-ecomm ]]; then
    log "/swapfile-ecomm already exists — enabling if needed"
    sudo swapon /swapfile-ecomm 2>/dev/null || true
    return 0
  fi
  run_long "fallocate 5G swap" sudo fallocate -l 5G /swapfile-ecomm
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
    owner="$(sudo ss -tulpn 2>/dev/null | awk -v p=":$port" '$5 ~ p"$" {print; exit}')"
    if [[ -z "$owner" ]]; then
      # Fallback without sudo (no process names)
      owner="$(ss -tulpn 2>/dev/null | awk -v p=":$port" '$5 ~ p"$" {print; exit}')"
    fi
    if [[ -z "$owner" ]]; then
      log "  :$port free"
      continue
    fi
    case "$port" in
      80|443)
        # On this host nginx always owns 80/443 (other apps). Accept LISTEN on these.
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
  if (( avail_kb < 2500000 )); then
    log "Low disk (<2.5G free) — pruning unused docker data"
    run_long "docker builder prune" docker builder prune -af || true
    run_long "docker image prune" docker image prune -af || true
  else
    log "Disk OK ($(df -h / | awk 'NR==2{print $4}') free)"
  fi
}

compose_up() {
  log "Building runtime images (COPY only) + starting stack"
  pushd "$ROOT/deploy" >/dev/null
  # Tiny VPS (~400MB RAM): never build FE+BE in parallel — BuildKit cancels with
  # "context canceled" when both load large COPY contexts at once.
  log "Stopping app containers to free RAM before image build"
  "${COMPOSE[@]}" stop backend frontend 2>/dev/null || true
  export BUILDKIT_MAX_PARALLELISM=1
  must_long "docker compose build backend" "${COMPOSE[@]}" build backend
  must_long "docker compose build frontend" "${COMPOSE[@]}" build frontend
  must_long "docker compose up" "${COMPOSE[@]}" up -d --remove-orphans
  popd >/dev/null
  log "Waiting for containers..."
  local i
  for i in $(seq 1 36); do
    if curl -fsS "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:${FRONTEND_HOST_PORT}/" >/dev/null 2>&1; then
      log "Local containers responding after ~$((i * 5))s"
      return 0
    fi
    log "... waiting for app readiness ($i/36)"
    sleep 5
  done
  (cd "$ROOT/deploy" && "${COMPOSE[@]}" ps) | tee -a "$LOG_FILE" || true
  docker ps -a | tee -a "$LOG_FILE" || true
  fail "Containers did not become ready in time"
}

run_seed() {
  local seed="$ROOT/db/seed.sql"
  [[ -f "$seed" ]] || fail "Missing db/seed.sql — sync it from the laptop (deploy-local.ps1)"
  log "Loading demo seed data into postgres ($seed)"
  local i
  for i in $(seq 1 30); do
    if (cd "$ROOT/deploy" && "${COMPOSE[@]}" exec -T postgres pg_isready -U ecommerce -d ecommerce) >/dev/null 2>&1; then
      break
    fi
    log "... waiting for postgres ($i/30)"
    sleep 2
  done
  log "START: db seed"
  if ! (cd "$ROOT/deploy" && "${COMPOSE[@]}" exec -T postgres \
      psql -U ecommerce -d ecommerce -v ON_ERROR_STOP=1) <"$seed" \
      > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2); then
    fail "db seed failed — see $LOG_FILE"
  fi
  log "DONE: db seed ($(elapsed) elapsed)"
}

install_nginx() {
  log "Installing/updating nginx site configs"
  local src_fe="$ROOT/deploy/nginx/$FRONTEND_DOMAIN"
  local src_api="$ROOT/deploy/nginx/$API_DOMAIN"
  [[ -f "$src_fe" && -f "$src_api" ]] || fail "Missing nginx templates under deploy/nginx/"

  # Drop legacy wrong-domain sites if present from earlier deploy attempt
  for old in ecommerce.arnold-oduor.com ecomm-api.arnold-oduor.com; do
    sudo rm -f "/etc/nginx/sites-enabled/$old" "/etc/nginx/sites-available/$old"
  done

  # Fresh HTTP templates (certbot will add SSL on first success)
  if [[ ! -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" ]]; then
    sudo cp "$src_fe" "/etc/nginx/sites-available/$FRONTEND_DOMAIN"
  else
    log "Cert exists for $FRONTEND_DOMAIN — leaving sites-available SSL blocks intact"
    if [[ ! -f "/etc/nginx/sites-available/$FRONTEND_DOMAIN" ]]; then
      sudo cp "$src_fe" "/etc/nginx/sites-available/$FRONTEND_DOMAIN"
    fi
  fi
  if [[ ! -d "/etc/letsencrypt/live/$API_DOMAIN" ]]; then
    sudo cp "$src_api" "/etc/nginx/sites-available/$API_DOMAIN"
  else
    log "Cert exists for $API_DOMAIN — leaving sites-available SSL blocks intact"
    if [[ ! -f "/etc/nginx/sites-available/$API_DOMAIN" ]]; then
      sudo cp "$src_api" "/etc/nginx/sites-available/$API_DOMAIN"
    fi
  fi

  # Always ensure proxy_pass targets are correct even if certbot-managed file exists
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
  # Soft check — if file has no proxy_pass to our port, rewrite from template for that domain.
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
  # Also accept a single combined cert covering both names
  if [[ -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" ]]; then
    log "TLS cert present for $FRONTEND_DOMAIN (may also cover API)"
    return 0
  fi
  local email
  email="$(prompt "Email for Let's Encrypt" "admin@oduor-arnold.com")"
  log "Requesting certs via certbot (nginx plugin)"
  if ! run_long "certbot" sudo certbot --nginx \
    -d "$FRONTEND_DOMAIN" \
    -d "$API_DOMAIN" \
    --non-interactive --agree-tos -m "$email" --redirect; then
    log "WARN: certbot failed (often DNS NXDOMAIN). Continuing with HTTP-only."
    log "WARN: Add A records for $FRONTEND_DOMAIN and $API_DOMAIN → this server, then re-run menu option 3."
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

  # Public HTTPS (letsencrypt live/ is root-owned — use sudo -d)
  if sudo test -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN"; then
    check_one "frontend-public" "https://${FRONTEND_DOMAIN}/"
    check_one "api-public" "https://${API_DOMAIN}/api/catalog/categories"
  else
    log "SKIP  frontend-public / api-public (no TLS cert yet — DNS/certbot pending)"
    # HTTP via nginx Host header still validates reverse-proxy wiring
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
echo
echo "Ecommerce server deploy"
echo "  root: $ROOT"
echo "  log:  $LOG_FILE"
echo
echo "  1) Full: swap check + ports + compose up + seed + nginx/ssl + health  [default]"
echo "  2) Compose only (rebuild/restart containers + seed)"
echo "  3) Nginx + certbot only"
echo "  4) Health checks only"
echo "  5) Seed database only"
echo

MODE="$(prompt "Choice" "1")"
log "Menu choice: $MODE"

echo
echo "Plan:"
case "$MODE" in
  1|"") echo "  • ensure swap (≥5G)"
        echo "  • verify ports"
        echo "  • docker compose build/up"
        echo "  • load db/seed.sql"
        echo "  • nginx + certbot"
        echo "  • health checks" ;;
  2) echo "  • docker compose build/up"
     echo "  • load db/seed.sql"
     echo "  • local smoke" ;;
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
    prune_disk_if_needed
    check_ports
    compose_up
    run_seed
    install_nginx
    ensure_certs
    health_checks
    ;;
  2)
    check_artifacts
    prune_disk_if_needed
    check_ports
    compose_up
    run_seed
    log "Local smoke:"
    curl -fsS "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories" >/dev/null \
      && log "PASS api-local" || fail "api-local failed"
    curl -fsS "http://127.0.0.1:${FRONTEND_HOST_PORT}/" >/dev/null \
      && log "PASS frontend-local" || fail "frontend-local failed"
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
