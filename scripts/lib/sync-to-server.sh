#!/usr/bin/env bash
# Rsync deploy/ + artifacts + seed + .env to the VPS.
set -euo pipefail
REPO="${REPO:?REPO required}"
REMOTE="${REMOTE:?REMOTE required}"
DEST="${DEST:?DEST required}"

SSH_OPTS=(-o ConnectTimeout=25 -o ServerAliveInterval=15 -o Ciphers=aes128-ctr -o IPQoS=none -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSH_IDENTITY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi
SSH=(ssh "${SSH_OPTS[@]}")
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "[sync] remote=$REMOTE dest=$DEST identity=${SSH_IDENTITY:-default}"
echo "[sync] mkdir remote tree..."
"${SSH[@]}" "$REMOTE" "mkdir -p $DEST/deploy/artifacts $DEST/db/migrations $DEST/deploy/nginx $DEST/scripts $DEST/deploy-logs"

echo "[sync] deploy/ (exclude artifacts)..."
rsync -az --info=progress2 -e "$RSYNC_SSH" --exclude artifacts \
  "$REPO/deploy/" "$REMOTE:$DEST/deploy/"

echo "[sync] migrations..."
rsync -az --info=progress2 -e "$RSYNC_SSH" \
  "$REPO/db/migrations/" "$REMOTE:$DEST/db/migrations/"

if [[ -f "$REPO/db/seed.sql" ]]; then
  echo "[sync] seed.sql..."
  rsync -az -e "$RSYNC_SSH" "$REPO/db/seed.sql" "$REMOTE:$DEST/db/seed.sql"
fi

if [[ -f "$REPO/flyway.conf" ]]; then
  echo "[sync] flyway.conf..."
  rsync -az -e "$RSYNC_SSH" "$REPO/flyway.conf" "$REMOTE:$DEST/flyway.conf"
fi

echo "[sync] deploy-server.sh..."
rsync -az -e "$RSYNC_SSH" \
  "$REPO/scripts/deploy-server.sh" "$REMOTE:$DEST/scripts/deploy-server.sh"

if [[ "${SYNC_ENV:-1}" == "1" && -f "$REPO/deploy/.env" ]]; then
  echo "[sync] deploy/.env (secrets)..."
  rsync -az -e "$RSYNC_SSH" "$REPO/deploy/.env" "$REMOTE:$DEST/deploy/.env"
  "${SSH[@]}" "$REMOTE" "chmod 600 $DEST/deploy/.env"
elif [[ "${SYNC_ENV:-1}" == "1" ]]; then
  echo "[sync] ERROR: SYNC_ENV=1 but no local deploy/.env" >&2
  exit 1
else
  echo "[sync] Skipping .env sync (SYNC_ENV=0)"
fi

echo "[sync] artifacts (api + frontend.tar.gz)..."
rsync -az --info=progress2 -e "$RSYNC_SSH" \
  "$REPO/deploy/artifacts/api" \
  "$REPO/deploy/artifacts/frontend.tar.gz" \
  "$REMOTE:$DEST/deploy/artifacts/"

echo "[sync] extract frontend + chmod..."
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
if [[ ! -f "\$DEST/deploy/.env" ]]; then
  echo "ERROR: missing \$DEST/deploy/.env on server" >&2
  exit 1
fi
ls -lh "\$DEST/deploy/artifacts/api" "\$DEST/deploy/artifacts/frontend.tar.gz"
du -sh "\$DEST/deploy/artifacts/frontend"
EOF

echo SYNC_OK
