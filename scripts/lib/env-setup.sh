#!/usr/bin/env bash
# Prepare deploy/.env from root .env and confirm sync to production.
# shellcheck shell=bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

REQUIRED_KEYS=(
  FRONTEND_DOMAIN API_DOMAIN
  FRONTEND_HOST_PORT BACKEND_HOST_PORT MINIO_HOST_PORT
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
  DATABASE_URL REDIS_ADDR
  ADMIN_EMAIL ADMIN_PASSWORD ADMIN_JWT_SECRET
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD
  MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET
  API_URL
)

env_get() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' || true
}

env_has_key() {
  local file="$1" key="$2"
  grep -qE "^${key}=" "$file" 2>/dev/null
}

env_set_or_replace() {
  local file="$1" key="$2" val="$3"
  local tmp
  tmp="$(mktemp)"
  if env_has_key "$file" "$key"; then
    awk -v k="$key" -v v="$val" '
      BEGIN { FS=OFS="=" }
      $1==k { print k"="v; next }
      { print }
    ' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >>"$file"
  fi
}

# Copy root .env → deploy/.env (LF), fill compose gaps, rewrite localhost → services.
materialize_deploy_env() {
  local src="$REPO_ROOT/.env"
  local dst="$REPO_ROOT/deploy/.env"
  local example="$REPO_ROOT/.env.example"

  if [[ ! -f "$src" ]]; then
    [[ -f "$example" ]] || fail "Missing root .env and .env.example"
    cp "$example" "$src"
    log "Created root .env from .env.example — edit secrets before deploy" WARN
  fi

  mkdir -p "$REPO_ROOT/deploy"
  # Strip BOM + CRLF; drop blank mangled lines
  sed '1s/^\xEF\xBB\xBF//' "$src" | sed 's/\r$//' >"$dst"

  # Compose-network hostnames if still pointing at localhost
  sed -i \
    -e 's|@localhost:5432|@postgres:5432|g' \
    -e 's|^REDIS_ADDR=localhost|REDIS_ADDR=redis|g' \
    -e 's|^REDIS_ADDR=127\.0\.0\.1|REDIS_ADDR=redis|g' \
    -e 's|^MINIO_ENDPOINT=localhost:9000|MINIO_ENDPOINT=minio:9000|g' \
    -e 's|^MINIO_ENDPOINT=127\.0\.0\.1:9000|MINIO_ENDPOINT=minio:9000|g' \
    "$dst"

  # Defaults for keys compose needs (only if missing / empty)
  [[ -n "$(env_get "$dst" FRONTEND_HOST_PORT)" ]] || env_set_or_replace "$dst" FRONTEND_HOST_PORT "3082"
  [[ -n "$(env_get "$dst" BACKEND_HOST_PORT)" ]] || env_set_or_replace "$dst" BACKEND_HOST_PORT "8082"
  [[ -n "$(env_get "$dst" MINIO_HOST_PORT)" ]] || env_set_or_replace "$dst" MINIO_HOST_PORT "9002"
  [[ -n "$(env_get "$dst" FRONTEND_DOMAIN)" ]] || env_set_or_replace "$dst" FRONTEND_DOMAIN "ecommerce.oduor-arnold.com"
  [[ -n "$(env_get "$dst" API_DOMAIN)" ]] || env_set_or_replace "$dst" API_DOMAIN "ecomm-api.oduor-arnold.com"
  [[ -n "$(env_get "$dst" API_URL)" ]] || env_set_or_replace "$dst" API_URL "http://backend:8080"
  [[ -n "$(env_get "$dst" NODE_ENV)" ]] || env_set_or_replace "$dst" NODE_ENV "production"
  [[ -n "$(env_get "$dst" HOSTNAME)" ]] || env_set_or_replace "$dst" HOSTNAME "0.0.0.0"
  [[ -n "$(env_get "$dst" PORT)" ]] || env_set_or_replace "$dst" PORT "8080"
  [[ -n "$(env_get "$dst" REDIS_ADDR)" ]] || env_set_or_replace "$dst" REDIS_ADDR "redis:6379"
  [[ -n "$(env_get "$dst" MINIO_ENDPOINT)" ]] || env_set_or_replace "$dst" MINIO_ENDPOINT "minio:9000"

  # Derive POSTGRES_* from DATABASE_URL if needed
  local dburl user pass hostdb
  dburl="$(env_get "$dst" DATABASE_URL)"
  if [[ -n "$dburl" ]]; then
    # postgres://user:pass@host:5432/db
    if [[ "$dburl" =~ postgres://([^:]+):([^@]+)@[^/]+/(.+)$ ]]; then
      [[ -n "$(env_get "$dst" POSTGRES_USER)" ]] || env_set_or_replace "$dst" POSTGRES_USER "${BASH_REMATCH[1]}"
      [[ -n "$(env_get "$dst" POSTGRES_PASSWORD)" ]] || env_set_or_replace "$dst" POSTGRES_PASSWORD "${BASH_REMATCH[2]}"
      [[ -n "$(env_get "$dst" POSTGRES_DB)" ]] || env_set_or_replace "$dst" POSTGRES_DB "${BASH_REMATCH[3]}"
    fi
  fi
  [[ -n "$(env_get "$dst" POSTGRES_DB)" ]] || env_set_or_replace "$dst" POSTGRES_DB "ecommerce"
  [[ -n "$(env_get "$dst" POSTGRES_USER)" ]] || env_set_or_replace "$dst" POSTGRES_USER "ecommerce"

  # MinIO root creds from access/secret if missing
  local ak sk
  ak="$(env_get "$dst" MINIO_ACCESS_KEY)"
  sk="$(env_get "$dst" MINIO_SECRET_KEY)"
  [[ -n "$(env_get "$dst" MINIO_ROOT_USER)" ]] || env_set_or_replace "$dst" MINIO_ROOT_USER "${ak:-minioadmin}"
  [[ -n "$(env_get "$dst" MINIO_ROOT_PASSWORD)" ]] || env_set_or_replace "$dst" MINIO_ROOT_PASSWORD "${sk:-minioadmin}"
  [[ -n "$(env_get "$dst" MINIO_BUCKET)" ]] || env_set_or_replace "$dst" MINIO_BUCKET "ecommerce"

  # Reject corrupted merged lines (KEY=OTHERKEY=value)
  if grep -qE '^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z_][A-Za-z0-9_]*=' "$dst"; then
    fail "deploy/.env has corrupted merged lines (KEY=OTHER=value). Fix root .env and re-run env setup."
  fi

  validate_deploy_env "$dst"
  log "Wrote $dst from root .env" OK
  DEPLOY_ENV_FILE="$dst"
}

validate_deploy_env() {
  local file="$1"
  local missing=()
  local k v
  for k in "${REQUIRED_KEYS[@]}"; do
    v="$(env_get "$file" "$k")"
    if [[ -z "$v" ]]; then
      missing+=("$k")
    fi
  done
  # Port values must be numeric only
  for k in FRONTEND_HOST_PORT BACKEND_HOST_PORT MINIO_HOST_PORT; do
    v="$(env_get "$file" "$k")"
    if [[ ! "$v" =~ ^[0-9]+$ ]]; then
      fail "Invalid $k='$v' (must be a port number). Check root .env"
    fi
  done
  if ((${#missing[@]} > 0)); then
    fail "deploy/.env missing required keys: ${missing[*]}"
  fi
  log "Env validation OK (${#REQUIRED_KEYS[@]} required keys)" OK
}

preview_env() {
  local env_path="$1"
  log "Env preview (secrets masked):"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    local k="${BASH_REMATCH[1]}" v="${BASH_REMATCH[2]}"
    # Skip obvious corruption
    [[ "$v" =~ = ]] && continue
    if [[ "$k" =~ PASSWORD|SECRET|PASSKEY|API_KEY|CONSUMER && -n "$v" ]]; then
      log "  $k=****"
    elif [[ "$k" == "DATABASE_URL" ]]; then
      log "  $k=postgres://****@****"
    else
      log "  $k=$v"
    fi
  done <"$env_path"
}

edit_env_interactive() {
  local env_path="$1"
  log "Interactive edit of root .env (Enter = keep). Result is re-copied to deploy/.env"
  local tmp
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "${line//[[:space:]]/}" ]]; then
      printf '%s\n' "$line" >>"$tmp"
      continue
    fi
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      local hint="$val"
      if [[ "$key" =~ PASSWORD|SECRET|PASSKEY|API_KEY|CONSUMER ]]; then
        if [[ -n "$val" ]]; then hint="****(${#val} chars)"; else hint="(empty)"; fi
      fi
      local new=""
      if [[ -z "${ECOMM_NONINTERACTIVE:-}" ]]; then
        read -r -p "$key [$hint]: " new || true
      fi
      if [[ -z "${new:-}" ]]; then
        printf '%s=%s\n' "$key" "$val" >>"$tmp"
      else
        printf '%s=%s\n' "$key" "$new" >>"$tmp"
      fi
    else
      printf '%s\n' "$line" >>"$tmp"
    fi
  done <"$env_path"
  mv "$tmp" "$env_path"
  log "Saved $env_path" OK
}

env_setup() {
  echo
  echo "Production env — source of truth is repo root .env"
  echo "  1) Copy root .env → deploy/.env (adapt for compose) + sync to server  [default]"
  echo "  2) Edit root .env interactively, then copy to deploy/.env"
  echo "  3) Open root .env in editor (\$EDITOR/nano), then copy"
  echo "  4) Skip env sync (keep whatever is already on the server)"
  echo
  local choice
  choice="$(prompt "Env choice" "1")"
  local root_env="$REPO_ROOT/.env"

  case "$choice" in
    1)
      materialize_deploy_env
      SYNC_ENV=1
      ;;
    2)
      [[ -f "$root_env" ]] || materialize_deploy_env
      edit_env_interactive "$root_env"
      materialize_deploy_env
      SYNC_ENV=1
      ;;
    3)
      [[ -f "$root_env" ]] || cp "$REPO_ROOT/.env.example" "$root_env"
      ${EDITOR:-nano} "$root_env"
      materialize_deploy_env
      SYNC_ENV=1
      ;;
    4)
      log "Skipping env sync" WARN
      SYNC_ENV=0
      ;;
    *) fail "Invalid env choice: $choice" ;;
  esac
  export SYNC_ENV

  if [[ "$SYNC_ENV" == "1" ]]; then
    preview_env "${DEPLOY_ENV_FILE:-$REPO_ROOT/deploy/.env}"
    confirm "Copy this env to production on sync?" || { log "Env declined"; exit 0; }
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  env_setup
fi
