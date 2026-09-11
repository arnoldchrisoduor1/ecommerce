#!/usr/bin/env bash
# Build FE/BE artifacts into deploy/artifacts/
# shellcheck shell=bash
set -euo pipefail
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

build_backend() {
  log "Cross-compiling Go API for linux/amd64..."
  mkdir -p "$ARTIFACT_DIR"
  rm -f "$ARTIFACT_DIR/api"
  (
    cd "$REPO_ROOT/backend"
    export CGO_ENABLED=0 GOOS=linux GOARCH=amd64
    run_logged "go build api" go build -o "$ARTIFACT_DIR/api" ./cmd/api
  )
  [[ -f "$ARTIFACT_DIR/api" ]] || fail "Missing $ARTIFACT_DIR/api"
  local mb
  mb="$(du -h "$ARTIFACT_DIR/api" | awk '{print $1}')"
  log "Backend binary OK ($mb)" OK
}

build_frontend() {
  log "Building Next.js standalone + packaging..."
  local fe="$REPO_ROOT/frontend"
  [[ -d "$fe" ]] || fail "Missing frontend/"
  (
    cd "$fe"
    if [[ ! -d node_modules ]]; then
      run_logged "npm ci" npm_cli ci
    else
      log "node_modules present - skipping npm ci"
    fi
    export API_URL="$PROD_API_URL"
    run_logged "next build" npm_cli run build
  )
  run_logged "package frontend" env REPO="$REPO_ROOT" bash "$LIB_DIR/pack-frontend.sh"
  [[ -f "$ARTIFACT_DIR/frontend/server.js" ]] || fail "Missing frontend/server.js"
  [[ -f "$ARTIFACT_DIR/frontend.tar.gz" ]] || fail "Missing frontend.tar.gz"
  log "Frontend artifact OK" OK
}

build_all() {
  build_backend
  build_frontend
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-all}" in
    be|backend) build_backend ;;
    fe|frontend) build_frontend ;;
    all|*) build_all ;;
  esac
fi
