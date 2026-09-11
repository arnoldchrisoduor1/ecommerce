#!/usr/bin/env bash
# Shared helpers for ./deploy (WSL / Linux).
# shellcheck shell=bash

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB_DIR="$REPO_ROOT/scripts/lib"
ARTIFACT_DIR="$REPO_ROOT/deploy/artifacts"
LOG_DIR="$REPO_ROOT/deploy-logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR" "$ARTIFACT_DIR"
LOG_FILE="${LOG_FILE:-$LOG_DIR/deploy-$TIMESTAMP.log}"
STARTED_AT="$(date +%s)"

ECOMM_SSH_HOST="${ECOMM_SSH_HOST:-root@204.48.30.58}"
ECOMM_REMOTE_ROOT="${ECOMM_REMOTE_ROOT:-/root/ecommerce}"
ECOMM_SSH_KEY="${ECOMM_SSH_KEY:-}"
ECOMM_MODE="${ECOMM_MODE:-1}"
PROD_API_URL="${PROD_API_URL:-http://backend:8080}"
SYNC_ENV="${SYNC_ENV:-1}"

if [[ -z "$ECOMM_SSH_KEY" ]]; then
  for cand in \
    "$HOME/.ssh/id_ed25519" \
    "/mnt/c/Users/${USER}/.ssh/id_ed25519" \
    "/mnt/c/Users/arnol/.ssh/id_ed25519"; do
    if [[ -f "$cand" ]]; then
      ECOMM_SSH_KEY="$cand"
      break
    fi
  done
fi

log() {
  local level="${2:-INFO}"
  local line
  line="[$(date '+%H:%M:%S')] [$level] $1"
  case "$level" in
    ERROR) printf '\033[31m%s\033[0m\n' "$line" ;;
    WARN)  printf '\033[33m%s\033[0m\n' "$line" ;;
    OK)    printf '\033[32m%s\033[0m\n' "$line" ;;
    *)     printf '%s\n' "$line" ;;
  esac
  printf '%s\n' "$line" >>"$LOG_FILE"
}

fail() {
  log "$*" ERROR
  log "See log: $LOG_FILE" ERROR
  exit 1
}

elapsed() { echo "$(( $(date +%s) - STARTED_AT ))s"; }

prompt() {
  local reply
  if [[ -n "${ECOMM_NONINTERACTIVE:-}" && -n "${2:-}" ]]; then
    echo "$2"
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
    log "Non-interactive: auto-yes ($1)"
    return 0
  fi
  local ans
  ans="$(prompt "${1:-Proceed?}" "Y")"
  case "$ans" in
    Y|y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

confirm_or_exit() {
  confirm "$@" || { log "Aborted."; exit 0; }
}

run_logged() {
  local label="$1"
  shift
  log "START: $label"
  log "CMD: $*"
  set +e
  "$@" 2>&1 | tee -a "$LOG_FILE"
  local rc=${PIPESTATUS[0]}
  set -e
  if (( rc != 0 )); then
    fail "FAIL: $label (exit $rc) after $(elapsed)"
  fi
  log "DONE: $label ($(elapsed) elapsed)" OK
}

ensure_ssh_identity() {
  [[ -n "$ECOMM_SSH_KEY" && -f "$ECOMM_SSH_KEY" ]] || fail "SSH key not found. Set ECOMM_SSH_KEY"
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh" 2>/dev/null || true
  local dst="$HOME/.ssh/ecomm-deploy-key"
  cp -f "$ECOMM_SSH_KEY" "$dst"
  chmod 600 "$dst"
  export SSH_IDENTITY="$dst"
  export REMOTE="$ECOMM_SSH_HOST"
  export DEST="$ECOMM_REMOTE_ROOT"
  log "SSH identity ready ($SSH_IDENTITY -> $REMOTE)" OK
}

ssh_test() {
  ensure_ssh_identity
  run_logged "ssh connectivity" \
    ssh -i "$SSH_IDENTITY" -o IdentitiesOnly=yes -o BatchMode=yes \
      -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
      -o Ciphers=aes128-ctr -o IPQoS=none \
      "$ECOMM_SSH_HOST" 'echo SSH_OK; hostname; whoami'
}

# On WSL always use Windows npm for Next.js (avoids linux SWC fetch on /mnt/c).
npm_cli() {
  if grep -qi microsoft /proc/version 2>/dev/null \
    && [[ -f "/mnt/c/Program Files/nodejs/npm.cmd" ]]; then
    local windir
    windir="$(wslpath -w "$(pwd)")"
    log "npm via Windows in $windir"
    # No nested quotes — paths under C:\dev\... have no spaces.
    cmd.exe /c "cd /d $windir && npm $*"
    return $?
  fi
  if command -v npm >/dev/null 2>&1 && [[ "$(command -v npm)" != /mnt/c/* ]]; then
    npm "$@"
    return $?
  fi
  fail "npm not found (install Node.js on Windows for WSL builds)"
}

lf_normalize_scripts() {
  find "$REPO_ROOT/scripts" -name '*.sh' -print0 2>/dev/null | xargs -0 sed -i 's/\r$//' || true
  [[ -f "$REPO_ROOT/deploy.sh" ]] && sed -i 's/\r$//' "$REPO_ROOT/deploy.sh" || true
}
