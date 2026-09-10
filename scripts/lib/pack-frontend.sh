#!/usr/bin/env bash
# Package Next.js standalone into deploy/artifacts/frontend (dereference symlinks).
# Usage: REPO=/mnt/c/dev/ecommerce bash scripts/lib/pack-frontend.sh
set -euo pipefail
REPO="${REPO:?REPO required}"
SRC="$REPO/frontend/.next/standalone"
STATIC="$REPO/frontend/.next/static"
PUBLIC="$REPO/frontend/public"
DEST="$REPO/deploy/artifacts/frontend"
WORKDIR=$(mktemp -d /tmp/ecomm-fe-XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

if [[ -f "$SRC/server.js" ]]; then
  ROOT="$SRC"
elif [[ -f "$SRC/frontend/server.js" ]]; then
  ROOT="$SRC/frontend"
else
  echo "Cannot find server.js under standalone" >&2
  find "$SRC" -name server.js 2>/dev/null | head -20 >&2 || true
  exit 1
fi

echo "standalone root: $ROOT"
tar -C "$ROOT" -cf - . | tar -C "$WORKDIR" -xf -
mkdir -p "$WORKDIR/.next"
tar -C "$(dirname "$STATIC")" -cf - "$(basename "$STATIC")" | tar -C "$WORKDIR/.next" -xf -
if [[ -d "$PUBLIC" ]]; then
  tar -C "$(dirname "$PUBLIC")" -cf - "$(basename "$PUBLIC")" | tar -C "$WORKDIR" -xf -
fi

if command -v rsync >/dev/null; then
  STAGE=$(mktemp -d /tmp/ecomm-fe-stage-XXXXXX)
  rsync -aL "$WORKDIR"/ "$STAGE"/
  rm -rf "$WORKDIR"
  WORKDIR="$STAGE"
fi

test -f "$WORKDIR/server.js"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -C "$WORKDIR" -cf - . | tar -C "$DEST" -xf -
test -f "$DEST/server.js"
echo "frontend artifact files: $(find "$DEST" | wc -l)"
du -sh "$DEST"

# Fast transfer archive
tar -C "$REPO/deploy/artifacts" -czf "$REPO/deploy/artifacts/frontend.tar.gz" frontend
ls -lh "$REPO/deploy/artifacts/frontend.tar.gz"
