# Production deployment — ecommerce → personal-server (`104.248.224.133`)

## One command (WSL)

```bash
cd /mnt/c/dev/ecommerce
./deploy.sh            # interactive menu
./deploy.sh e2e        # test + build + git + sync + server (includes seed)
./deploy.sh sync       # rsync + remote deploy (seed in server modes 1/2/5)
./deploy.sh --help
```

From PowerShell: `.\scripts\deploy-local.ps1`

| # | Action |
|---|--------|
| **1 / e2e** | Test + build + git + sync + server (seed + nginx/ssl) |
| 2 / build | Build FE+BE |
| 3 / test | Local go vet/build |
| 4 / git | Commit + push |
| 5 / sync | Sync + server (seed on modes 1/2) |
| 6 / release | Build + sync + server |
| 7 / remote | Server only |
| 8 / env | Copy root `.env` → production |
| 9 / be | Backend build |
| 10 / fe | Frontend build |

**Seed:** `db/seed.sql` is synced with artifacts. Server menu **1**, **2**, and **5** load it into postgres (`run_seed`). Full/e2e defaults to server mode **1**.

## Target server

| Item | Value |
|------|-------|
| Host | `104.248.224.133` (hostname `perseonal-server`) |
| SSH | `root` + `%USERPROFILE%\.ssh\id_ed25519` |
| Deploy home | `/root/ecommerce` |
| Ports | FE `:3082`, API `:8082`, MinIO `:9002` |
| Domains | `ecommerce.oduor-arnold.com`, `ecomm-api.oduor-arnold.com` |

```bash
export ECOMM_SSH_HOST=root@104.248.224.133
export ECOMM_REMOTE_ROOT=/root/ecommerce
export ECOMM_SSH_KEY=$HOME/.ssh/id_ed25519
export ECOMM_MODE=1   # full: compose + seed + nginx + certbot
```

SSH config alias (optional):

```
Host ecomm-deploy
    HostName 104.248.224.133
    User root
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

## Secrets

- Source of truth: root `.env` → copied to `deploy/.env` → synced to VPS
- Compose has no hardcoded secrets

## DNS + TLS

A records should be `104.248.224.133`. Deploy runs certbot on server mode **1** or **3**.
