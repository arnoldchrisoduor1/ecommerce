#!/usr/bin/env bash
# Create / edit deploy/.env before sync.
# shellcheck shell=bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_env_file() {
  local example="$REPO_ROOT/deploy/.env.example"
  local local_env="$REPO_ROOT/deploy/.env"
  [[ -f "$example" ]] || fail "Missing deploy/.env.example"
  if [[ ! -f "$local_env" ]]; then
    cp "$example" "$local_env"
    log "Created deploy/.env from .env.example" WARN
  fi
  echo "$local_env"
}

edit_env_interactive() {
  local env_path="$1"
  log "Interactive env edit (Enter = keep current)"
  local tmp
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
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
      local new
      if [[ -n "${ECOMM_NONINTERACTIVE:-}" ]]; then
        new=""
      else
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

preview_env() {
  local env_path="$1"
  log "Env preview (secrets masked):"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    local k="${BASH_REMATCH[1]}" v="${BASH_REMATCH[2]}"
    if [[ "$k" =~ PASSWORD|SECRET|PASSKEY|API_KEY|CONSUMER && -n "$v" ]]; then
      log "  $k=****"
    elif [[ "$k" == "DATABASE_URL" ]]; then
      log "  $k=postgres://****@****"
    else
      log "  $k=$v"
    fi
  done <"$env_path"
}

env_setup() {
  echo
  echo "Production env (deploy/.env) - synced to server (not in compose)"
  echo "  1) Use / create local deploy/.env  [default]"
  echo "  2) Edit values interactively"
  echo "  3) Open in editor (\$EDITOR or nano)"
  echo "  4) Skip env sync (keep server copy)"
  echo
  local choice
  choice="$(prompt "Env choice" "1")"
  local local_env
  local_env="$(ensure_env_file)"

  case "$choice" in
    1)
      log "Using $local_env"
      SYNC_ENV=1
      ;;
    2)
      edit_env_interactive "$local_env"
      SYNC_ENV=1
      ;;
    3)
      ${EDITOR:-nano} "$local_env"
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
    preview_env "$local_env"
    confirm "Continue with this env?" || { log "Env declined"; exit 0; }
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  env_setup
fi
