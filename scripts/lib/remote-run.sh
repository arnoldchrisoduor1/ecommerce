#!/usr/bin/env bash
# Trigger deploy-server.sh on the VPS (default menu + confirm).
set -euo pipefail
ssh -o ConnectTimeout=25 -o Ciphers=aes128-ctr -o IPQoS=none dw-ecomm 'bash -s' <<'EOF'
set -euo pipefail
cd /home/ubuntu/ecommerce
printf '\nY\n' | bash scripts/deploy-server.sh
EOF
