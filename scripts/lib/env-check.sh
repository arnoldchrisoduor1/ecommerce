#!/usr/bin/env bash
# Preflight / environment check: laptop + remote VPS.
# shellcheck shell=bash
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

_ec_pass=0
_ec_fail=0
_ec_warn=0

ec_ok() {
  log "PASS  $1" OK
  _ec_pass=$((_ec_pass + 1))
}
ec_bad() {
  log "FAIL  $1" ERROR
  _ec_fail=$((_ec_fail + 1))
}
ec_warn() {
  log "WARN  $1" WARN
  _ec_warn=$((_ec_warn + 1))
}

# Load domains / ports from deploy/.env or root .env when present.
_ec_load_env() {
  local f key val
  for f in "$REPO_ROOT/deploy/.env" "$REPO_ROOT/.env"; do
    [[ -f "$f" ]] || continue
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]] || continue
      key="${line%%=*}"
      val="${line#*=}"
      case "$key" in
        FRONTEND_DOMAIN|API_DOMAIN|FRONTEND_HOST_PORT|BACKEND_HOST_PORT|MINIO_HOST_PORT)
          printf -v "$key" '%s' "$val"
          ;;
      esac
    done <"$f"
    break
  done
  FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-ecommerce.oduor-arnold.com}"
  API_DOMAIN="${API_DOMAIN:-ecomm-api.oduor-arnold.com}"
  FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-3082}"
  BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-8082}"
  MINIO_HOST_PORT="${MINIO_HOST_PORT:-9002}"
}

_ec_resolve() {
  local host="$1" ip=""
  ip="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}')" || true
  if [[ -z "$ip" ]]; then
    ip="$(dig +short A "$host" 2>/dev/null | head -1 || true)"
  fi
  echo "$ip"
}

_ec_http_code() {
  local url="$1"
  curl -sS --max-time 20 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000"
}

_ec_https_code() {
  local url="$1"
  # Follow redirects; accept any response that proves TLS + HTTP spoke
  curl -sS -L --max-time 25 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000"
}

_ec_ssl_expiry() {
  local host="$1"
  local end
  end="$(echo | openssl s_client -servername "$host" -connect "${host}:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  if [[ -z "$end" ]]; then
    echo ""
    return 1
  fi
  echo "$end"
}

# Remote checks over SSH (does not require ecommerce tree).
_ec_remote() {
  local out
  out="$(ssh -i "$SSH_IDENTITY" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
    -o Ciphers=aes128-ctr -o IPQoS=none \
    "$ECOMM_SSH_HOST" \
    FRONTEND_DOMAIN="$FRONTEND_DOMAIN" \
    API_DOMAIN="$API_DOMAIN" \
    FRONTEND_HOST_PORT="$FRONTEND_HOST_PORT" \
    BACKEND_HOST_PORT="$BACKEND_HOST_PORT" \
    MINIO_HOST_PORT="$MINIO_HOST_PORT" \
    ECOMM_REMOTE_ROOT="$ECOMM_REMOTE_ROOT" \
    bash -s <<'REMOTE'
set +e
pass=0; fail=0; warn=0
ok()  { echo "R_PASS $1"; pass=$((pass+1)); }
bad() { echo "R_FAIL $1"; fail=$((fail+1)); }
wrn() { echo "R_WARN $1"; warn=$((warn+1)); }

echo "R_HOST $(hostname) $(uname -srm)"

# Docker
if command -v docker >/dev/null 2>&1; then
  ver="$(docker --version 2>/dev/null | head -1)"
  if docker info >/dev/null 2>&1; then
    ok "docker installed and daemon running ($ver)"
  else
    bad "docker binary present but daemon not reachable ($ver)"
  fi
else
  bad "docker not installed"
fi

if docker compose version >/dev/null 2>&1; then
  ok "docker compose $(docker compose version --short 2>/dev/null || echo ok)"
elif command -v docker-compose >/dev/null 2>&1; then
  wrn "docker-compose v1 found (prefer docker compose plugin)"
else
  bad "docker compose not available"
fi

# Nginx
if command -v nginx >/dev/null 2>&1; then
  ok "nginx installed ($(nginx -v 2>&1))"
  if systemctl is-active --quiet nginx 2>/dev/null || service nginx status >/dev/null 2>&1; then
    ok "nginx service active"
  else
    bad "nginx installed but service not active"
  fi
  if nginx -t >/dev/null 2>&1; then
    ok "nginx config test (nginx -t)"
  else
    bad "nginx -t failed"
  fi
else
  bad "nginx not installed"
fi

# Certbot / TLS files
if command -v certbot >/dev/null 2>&1; then
  ok "certbot installed ($(certbot --version 2>&1 | head -1))"
else
  wrn "certbot not installed (needed for Let's Encrypt)"
fi

for d in "$FRONTEND_DOMAIN" "$API_DOMAIN"; do
  if [[ -d "/etc/letsencrypt/live/$d" ]] || [[ -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" && "$d" == "$API_DOMAIN" ]]; then
    # API often shares cert with FE when issued together
    if [[ -f "/etc/letsencrypt/live/$d/fullchain.pem" ]]; then
      exp="$(openssl x509 -in "/etc/letsencrypt/live/$d/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2)"
      ok "TLS cert on disk for $d (expires $exp)"
    elif [[ -f "/etc/letsencrypt/live/$FRONTEND_DOMAIN/fullchain.pem" ]]; then
      ok "TLS cert shared under $FRONTEND_DOMAIN (covers $d if SAN)"
    else
      wrn "letsencrypt live dir missing fullchain for $d"
    fi
  else
    wrn "no Let's Encrypt live cert for $d yet"
  fi
done

# Listening ports (ss or netstat)
port_listen() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"
  else
    return 2
  fi
}

for p in 80 443 "$FRONTEND_HOST_PORT" "$BACKEND_HOST_PORT" "$MINIO_HOST_PORT"; do
  if port_listen "$p"; then
    ok "port $p listening on server"
  else
    rc=$?
    if [[ $rc -eq 2 ]]; then
      wrn "cannot check listeners (ss/netstat missing) for port $p"
    elif [[ "$p" == "80" || "$p" == "443" ]]; then
      bad "port $p not listening (nginx expected)"
    else
      wrn "port $p not listening (app stack may be down)"
    fi
  fi
done

# Firewall hint (ufw)
if command -v ufw >/dev/null 2>&1; then
  st="$(ufw status 2>/dev/null | head -1)"
  echo "R_INFO ufw: $st"
fi

# Compose project if synced
if [[ -d "$ECOMM_REMOTE_ROOT/deploy" && -f "$ECOMM_REMOTE_ROOT/deploy/docker-compose.prod.yml" ]]; then
  if (cd "$ECOMM_REMOTE_ROOT/deploy" && docker compose -f docker-compose.prod.yml --env-file .env ps --status running 2>/dev/null | grep -q .); then
    ok "ecommerce compose has running containers"
    (cd "$ECOMM_REMOTE_ROOT/deploy" && docker compose -f docker-compose.prod.yml --env-file .env ps 2>/dev/null) | sed 's/^/R_INFO /'
  else
    wrn "ecommerce compose present but no running containers (or .env missing)"
  fi
else
  wrn "deploy tree not synced yet at $ECOMM_REMOTE_ROOT/deploy"
fi

# Local HTTP via loopback + Host header
if curl -fsS --max-time 10 -o /dev/null -H "Host: $FRONTEND_DOMAIN" "http://127.0.0.1/" 2>/dev/null; then
  ok "nginx answers Host:$FRONTEND_DOMAIN on :80"
else
  wrn "nginx Host:$FRONTEND_DOMAIN on :80 not serving yet"
fi
if curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:${BACKEND_HOST_PORT}/api/catalog/categories" 2>/dev/null; then
  ok "backend loopback :$BACKEND_HOST_PORT"
else
  wrn "backend not answering on 127.0.0.1:$BACKEND_HOST_PORT"
fi
if curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:${FRONTEND_HOST_PORT}/" 2>/dev/null; then
  ok "frontend loopback :$FRONTEND_HOST_PORT"
else
  wrn "frontend not answering on 127.0.0.1:$FRONTEND_HOST_PORT"
fi

echo "R_SUMMARY pass=$pass fail=$fail warn=$warn"
REMOTE
)" || {
    ec_bad "SSH remote environment probe failed"
    return 0
  }

  while IFS= read -r line; do
    case "$line" in
      R_PASS\ *) ec_ok "${line#R_PASS }" ;;
      R_FAIL\ *) ec_bad "${line#R_FAIL }" ;;
      R_WARN\ *) ec_warn "${line#R_WARN }" ;;
      R_HOST\ *) log "Remote host: ${line#R_HOST }" ;;
      R_INFO\ *) log "  ${line#R_INFO }" ;;
      R_SUMMARY\ *) log "Remote tallies: ${line#R_SUMMARY }" ;;
      *) [[ -n "$line" ]] && log "  $line" ;;
    esac
  done <<<"$out"
}

_ec_external() {
  local expect_ip fe_ip api_ip code end
  expect_ip="$(echo "$ECOMM_SSH_HOST" | sed -E 's/^[^@]+@//')"

  log "=== External / DNS / TLS (from this machine) ==="
  fe_ip="$(_ec_resolve "$FRONTEND_DOMAIN")"
  api_ip="$(_ec_resolve "$API_DOMAIN")"
  log "  $FRONTEND_DOMAIN -> ${fe_ip:-UNRESOLVED}"
  log "  $API_DOMAIN -> ${api_ip:-UNRESOLVED}"

  if [[ "$fe_ip" == "$expect_ip" ]]; then
    ec_ok "DNS $FRONTEND_DOMAIN → $expect_ip"
  else
    ec_bad "DNS $FRONTEND_DOMAIN is '${fe_ip:-unset}', expected $expect_ip"
  fi
  if [[ "$api_ip" == "$expect_ip" ]]; then
    ec_ok "DNS $API_DOMAIN → $expect_ip"
  else
    ec_bad "DNS $API_DOMAIN is '${api_ip:-unset}', expected $expect_ip"
  fi

  # TCP / HTTP reachability
  code="$(_ec_http_code "http://${FRONTEND_DOMAIN}/")"
  if [[ "$code" =~ ^[12345][0-9][0-9]$ ]]; then
    ec_ok "external HTTP http://$FRONTEND_DOMAIN/ → $code"
  else
    ec_bad "external HTTP http://$FRONTEND_DOMAIN/ unreachable (code=$code)"
  fi

  code="$(_ec_https_code "https://${FRONTEND_DOMAIN}/")"
  if [[ "$code" =~ ^[12345][0-9][0-9]$ ]]; then
    ec_ok "external HTTPS https://$FRONTEND_DOMAIN/ → $code"
  else
    ec_bad "external HTTPS https://$FRONTEND_DOMAIN/ unreachable (code=$code)"
  fi

  code="$(_ec_https_code "https://${API_DOMAIN}/api/catalog/categories")"
  if [[ "$code" =~ ^(200|301|302)$ ]]; then
    ec_ok "external API https://$API_DOMAIN/api/catalog/categories → $code"
  elif [[ "$code" =~ ^[12345][0-9][0-9]$ ]]; then
    ec_warn "external API reachable but unexpected HTTP $code"
  else
    ec_bad "external API https://$API_DOMAIN/... unreachable (code=$code)"
  fi

  # SSL certificate validity (openssl)
  if command -v openssl >/dev/null 2>&1; then
    end="$(_ec_ssl_expiry "$FRONTEND_DOMAIN" || true)"
    if [[ -n "$end" ]]; then
      ec_ok "SSL cert for $FRONTEND_DOMAIN valid until $end"
    else
      ec_bad "SSL handshake/cert read failed for $FRONTEND_DOMAIN:443"
    fi
    end="$(_ec_ssl_expiry "$API_DOMAIN" || true)"
    if [[ -n "$end" ]]; then
      ec_ok "SSL cert for $API_DOMAIN valid until $end"
    else
      ec_bad "SSL handshake/cert read failed for $API_DOMAIN:443"
    fi
  else
    ec_warn "openssl not available locally — skipped cert expiry probe"
  fi
}

env_check() {
  _ec_pass=0
  _ec_fail=0
  _ec_warn=0
  _ec_load_env

  log "=== Environment check ==="
  log "Host: $ECOMM_SSH_HOST  sites: $FRONTEND_DOMAIN / $API_DOMAIN"
  log "App ports: FE=$FRONTEND_HOST_PORT BE=$BACKEND_HOST_PORT MINIO=$MINIO_HOST_PORT"

  log "=== SSH ==="
  ensure_ssh_identity
  if ssh -i "$SSH_IDENTITY" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
    -o Ciphers=aes128-ctr -o IPQoS=none \
    "$ECOMM_SSH_HOST" 'echo SSH_OK' >/dev/null 2>&1; then
    ec_ok "SSH to $ECOMM_SSH_HOST"
  else
    ec_bad "SSH to $ECOMM_SSH_HOST failed"
    log "Summary: ${_ec_pass} passed, ${_ec_fail} failed, ${_ec_warn} warnings (remote skipped)"
    (( _ec_fail == 0 )) || fail "Environment check failed"
    return 0
  fi

  log "=== Remote server (nginx / docker / ports / ssl files) ==="
  _ec_remote

  _ec_external

  echo
  log "Summary: ${_ec_pass} passed, ${_ec_fail} failed, ${_ec_warn} warnings"
  if (( _ec_fail > 0 )); then
    fail "Environment check failed (${_ec_fail} critical)"
  fi
  log "Environment check OK" OK
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  env_check
fi
