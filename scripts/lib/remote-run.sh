#!/usr/bin/env bash
# Trigger deploy-server.sh on the VPS (non-interactive by default).
set -euo pipefail
REMOTE="${REMOTE:-root@204.48.30.58}"
DEST="${DEST:-/root/ecommerce}"
MODE="${ECOMM_MODE:-2}"

SSH_OPTS=(-o ConnectTimeout=25 -o ServerAliveInterval=15 -o Ciphers=aes128-ctr -o IPQoS=none -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSH_IDENTITY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi

echo "[remote-run] $REMOTE:$DEST mode=$MODE"
ssh "${SSH_OPTS[@]}" "$REMOTE" "bash -s" <<EOF
set -euo pipefail
cd '$DEST'
export ECOMM_NONINTERACTIVE=1
export ECOMM_MODE='$MODE'
bash scripts/deploy-server.sh
EOF
echo REMOTE_DEPLOY_OK
