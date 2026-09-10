#!/usr/bin/env bash
# Rsync deploy/ + artifacts + seed to the VPS.
# Usage: REPO=... REMOTE=dw-ecomm DEST=/home/ubuntu/ecommerce bash scripts/lib/sync-to-server.sh
set -euo pipefail
REPO="${REPO:?REPO required}"
REMOTE="${REMOTE:?REMOTE required}"
DEST="${DEST:?DEST required}"
SSH=(ssh -o ConnectTimeout=25 -o Ciphers=aes128-ctr -o IPQoS=none)
RSYNC_SSH="ssh -o ConnectTimeout=25 -o Ciphers=aes128-ctr -o IPQoS=none"

"${SSH[@]}" "$REMOTE" "mkdir -p $DEST/deploy/artifacts $DEST/db/migrations $DEST/deploy/nginx $DEST/scripts $DEST/deploy-logs"

rsync -az --info=progress2 -e "$RSYNC_SSH" --exclude artifacts \
  "$REPO/deploy/" "$REMOTE:$DEST/deploy/"

rsync -az --info=progress2 -e "$RSYNC_SSH" \
  "$REPO/db/migrations/" "$REMOTE:$DEST/db/migrations/"

if [[ -f "$REPO/db/seed.sql" ]]; then
  rsync -az -e "$RSYNC_SSH" "$REPO/db/seed.sql" "$REMOTE:$DEST/db/seed.sql"
fi

if [[ -f "$REPO/flyway.conf" ]]; then
  rsync -az -e "$RSYNC_SSH" "$REPO/flyway.conf" "$REMOTE:$DEST/flyway.conf"
fi

rsync -az -e "$RSYNC_SSH" \
  "$REPO/scripts/deploy-server.sh" "$REMOTE:$DEST/scripts/deploy-server.sh"

rsync -az --info=progress2 -e "$RSYNC_SSH" \
  "$REPO/deploy/artifacts/api" \
  "$REPO/deploy/artifacts/frontend.tar.gz" \
  "$REMOTE:$DEST/deploy/artifacts/"

"${SSH[@]}" "$REMOTE" "bash -s" <<EOF
set -euo pipefail
DEST=$DEST
chmod +x "\$DEST/scripts/deploy-server.sh"
sed -i 's/\r\$//' "\$DEST/scripts/deploy-server.sh"
chmod +x "\$DEST/deploy/artifacts/api"
rm -rf "\$DEST/deploy/artifacts/frontend"
mkdir -p "\$DEST/deploy/artifacts"
tar -C "\$DEST/deploy/artifacts" -xzf "\$DEST/deploy/artifacts/frontend.tar.gz"
test -f "\$DEST/deploy/artifacts/frontend/server.js"
EOF

echo SYNC_OK
