#!/usr/bin/env bash
# Git add / commit / push (excludes artifacts + secrets).
# shellcheck shell=bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_commit_push() {
  cd "$REPO_ROOT"
  log "Working tree:"
  git status --short | while read -r l; do log "  $l"; done || true

  local msg
  msg="$(prompt "Commit message" "chore: deploy ecommerce")"
  confirm "git add / commit / push?" || { log "Skipping git"; return 0; }

  git add -A
  local path
  for path in deploy/artifacts deploy-logs .tmp backend/api.exe backend/api.exe~ .env deploy/.env; do
    git reset HEAD -- "$path" 2>/dev/null || true
    git rm -r --cached --ignore-unmatch -- "$path" 2>/dev/null || true
  done

  if [[ -z "$(git diff --cached --name-only)" ]]; then
    log "Nothing staged to commit - continuing"
  else
    git commit -m "$msg"
    log "Commit created" OK
  fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  run_logged "git push origin $branch" git push -u origin HEAD
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  git_commit_push
fi
