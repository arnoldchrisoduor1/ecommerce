#!/usr/bin/env bash
# Root deploy CLI (run in WSL from repo root).
#
#   ./deploy.sh              # interactive menu
#   ./deploy.sh 1            # full e2e
#   ./deploy.sh e2e          # same
#   ECOMM_NONINTERACTIVE=1 ./deploy.sh 6
#
# Support scripts live under scripts/lib/ and scripts/deploy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# shellcheck source=scripts/lib/common.sh
source "$ROOT/scripts/lib/common.sh"
# shellcheck source=scripts/lib/build.sh
source "$ROOT/scripts/lib/build.sh"
# shellcheck source=scripts/lib/test-local.sh
source "$ROOT/scripts/lib/test-local.sh"
# shellcheck source=scripts/lib/env-setup.sh
source "$ROOT/scripts/lib/env-setup.sh"
# shellcheck source=scripts/lib/git-push.sh
source "$ROOT/scripts/lib/git-push.sh"

lf_normalize_scripts

do_sync() {
  ensure_ssh_identity
  export REPO="$REPO_ROOT"
  export REMOTE="$ECOMM_SSH_HOST"
  export DEST="$ECOMM_REMOTE_ROOT"
  export SYNC_ENV="${SYNC_ENV:-1}"
  confirm_or_exit "Rsync to ${REMOTE}:${DEST}?"
  [[ -f "$ARTIFACT_DIR/api" ]] || fail "Missing deploy/artifacts/api - build first"
  [[ -f "$ARTIFACT_DIR/frontend.tar.gz" ]] || fail "Missing deploy/artifacts/frontend.tar.gz - build first"
  if [[ "$SYNC_ENV" == "1" && ! -f "$REPO_ROOT/deploy/.env" ]]; then
    fail "Missing deploy/.env - run env setup"
  fi
  run_logged "rsync to server" bash "$LIB_DIR/sync-to-server.sh"
}

do_remote() {
  ensure_ssh_identity
  export REMOTE="$ECOMM_SSH_HOST"
  export DEST="$ECOMM_REMOTE_ROOT"
  local mode
  mode="${ECOMM_MODE:-}"
  if [[ -z "$mode" ]]; then
    mode="$(prompt "Server menu mode (1=full 2=compose 3=nginx)" "2")"
  fi
  export ECOMM_MODE="$mode"
  confirm_or_exit "Run deploy-server.sh on ${REMOTE} mode ${mode}?"
  run_logged "remote deploy-server.sh" bash "$LIB_DIR/remote-run.sh"
}

usage_menu() {
  echo
  echo "Ecommerce deploy (WSL)"
  echo "  repo:   $REPO_ROOT"
  echo "  log:    $LOG_FILE"
  echo "  ssh:    $ECOMM_SSH_HOST -> $ECOMM_REMOTE_ROOT"
  echo "  key:    ${ECOMM_SSH_KEY:-unset}"
  echo
  echo "  1) End-to-end: test + build + git push + sync + server  [default]"
  echo "  2) Build locally (FE+BE)"
  echo "  3) Test locally (go vet/build)"
  echo "  4) Git commit + push"
  echo "  5) Sync + server deploy (no rebuild)"
  echo "  6) Build + sync + server (skip test/git)"
  echo "  7) Server deploy only (remote)"
  echo "  8) Env setup only"
  echo "  9) Backend build only"
  echo " 10) Frontend build only"
  echo
}

resolve_choice() {
  local raw="${1:-}"
  case "$raw" in
    "" ) echo "1" ;;
    e2e|full|all) echo "1" ;;
    build) echo "2" ;;
    test) echo "3" ;;
    git|push) echo "4" ;;
    sync) echo "5" ;;
    release) echo "6" ;;
    remote|server) echo "7" ;;
    env) echo "8" ;;
    be|backend) echo "9" ;;
    fe|frontend) echo "10" ;;
    10) echo "10" ;;
    [1-9]) echo "$raw" ;;
    *) fail "Unknown option: $raw (try ./deploy.sh --help)" ;;
  esac
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
    usage_menu
    echo "Also: ./deploy.sh e2e|build|test|git|sync|release|remote|env|be|fe"
    exit 0
  fi

  local choice
  if [[ $# -gt 0 ]]; then
    choice="$(resolve_choice "$1")"
  else
    usage_menu
    choice="$(prompt "Choice" "1")"
    choice="$(resolve_choice "$choice")"
  fi
  log "Menu choice: $choice"

  local do_test=0 do_build=0 do_be=0 do_fe=0 do_git=0 do_env=0 do_sync=0 do_remote=0
  case "$choice" in
    1)  do_test=1; do_build=1; do_git=1; do_env=1; do_sync=1; do_remote=1 ;;
    2)  do_build=1 ;;
    3)  do_test=1 ;;
    4)  do_git=1 ;;
    5)  do_env=1; do_sync=1; do_remote=1 ;;
    6)  do_build=1; do_env=1; do_sync=1; do_remote=1 ;;
    7)  do_remote=1 ;;
    8)  do_env=1 ;;
    9)  do_be=1 ;;
    10) do_fe=1 ;;
    *) fail "Invalid choice: $choice" ;;
  esac

  log "Plan test=$do_test build=$do_build be=$do_be fe=$do_fe git=$do_git env=$do_env sync=$do_sync remote=$do_remote"
  confirm_or_exit "Run this plan?"

  if (( do_sync || do_remote )); then
    ssh_test
  fi
  if (( do_env )); then
    env_setup
  fi
  if (( do_test )); then
    test_local
  fi
  if (( do_build )); then
    build_all
  fi
  if (( do_be )); then
    build_backend
  fi
  if (( do_fe )); then
    build_frontend
  fi
  if (( do_git )); then
    git_commit_push
  fi
  if (( do_sync )); then
    do_sync
  fi
  if (( do_remote )); then
    do_remote
  fi

  log "ALL DONE" OK
  echo
  echo "Log: $LOG_FILE"
}

main "$@"
