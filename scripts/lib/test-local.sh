#!/usr/bin/env bash
# Local checks: go vet/build + optional Playwright.
# shellcheck shell=bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

test_backend() {
  log "Backend checks (vet + build for host)..."
  (
    cd "$REPO_ROOT/backend"
    run_logged "go vet" go vet ./...
    run_logged "go build (host)" go build -o /tmp/ecomm-api-test ./cmd/api
    rm -f /tmp/ecomm-api-test
  )
  log "Backend tests OK" OK
}

test_frontend_typecheck() {
  local fe="$REPO_ROOT/frontend"
  [[ -d "$fe" ]] || return 0
  (
    cd "$fe"
    if [[ ! -d node_modules ]]; then
      log "frontend node_modules missing - skipping lint/typecheck" WARN
      return 0
    fi
    # Prefer a light check if script exists; otherwise skip.
    if npm_cli run | grep -q 'lint'; then
      run_logged "frontend lint" npm_cli run lint || log "lint warnings/errors (non-fatal for deploy gate)" WARN
    fi
  )
}

test_playwright() {
  local tests="$REPO_ROOT/tests"
  if [[ ! -f "$tests/package.json" ]]; then
    log "No tests/ package - skipping Playwright" WARN
    return 0
  fi
  if [[ -z "${ECOMM_RUN_E2E:-}" ]]; then
    log "Skipping Playwright (set ECOMM_RUN_E2E=1 to enable; needs local stack on :3000)" WARN
    return 0
  fi
  (
    cd "$tests"
    [[ -d node_modules ]] || run_logged "tests npm ci" npm_cli ci
    run_logged "playwright test" npm_cli exec -- playwright test
  )
}

test_local() {
  test_backend
  test_frontend_typecheck
  test_playwright
  log "Local tests finished" OK
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  test_local
fi
