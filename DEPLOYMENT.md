# Production deployment — ecommerce → hauseoftech (`204.48.30.58`)

## One command (WSL)

```bash
cd /mnt/c/dev/ecommerce
./deploy.sh            # interactive menu
./deploy.sh e2e        # test + build + git + sync + server
./deploy.sh build      # FE+BE only
./deploy.sh test       # go vet/build
./deploy.sh git        # commit + push
./deploy.sh sync       # rsync + remote deploy
./deploy.sh release    # build + sync + server (no git/test)
./deploy.sh remote     # server script only
./deploy.sh --help
```

From PowerShell: `.\scripts\deploy-local.ps1` (wraps WSL `./deploy.sh`).

| # | Action |
|---|--------|
| **1 / e2e** | Test + build + git push + sync + server deploy |
| 2 / build | Build FE+BE locally |
| 3 / test | Local go vet/build |
| 4 / git | Commit + push |
| 5 / sync | Sync artifacts + server deploy |
| 6 / release | Build + sync + server |
| 7 / remote | Server deploy only |
| 8 / env | Env file setup |
| 9 / be | Backend build only |
| 10 / fe | Frontend build only |

Support code: `scripts/lib/*.sh`, server: `scripts/deploy-server.sh`.

## Target server

| Item | Value |
|------|-------|
| Host | `204.48.30.58` (hostname `hauseoftech`) |
| SSH | `root` + `%USERPROFILE%\.ssh\id_ed25519` (or `ECOMM_SSH_KEY`) |
| Deploy home | `/root/ecommerce` |
| Ports | FE `:3082`, API `:8082`, MinIO `:9002` |

```bash
export ECOMM_SSH_HOST=root@204.48.30.58
export ECOMM_REMOTE_ROOT=/root/ecommerce
export ECOMM_SSH_KEY=$HOME/.ssh/id_ed25519
export ECOMM_MODE=2          # server menu when remote-run
export ECOMM_NONINTERACTIVE=1
```

## Secrets

- Not in compose — use `deploy/.env` (from `deploy/.env.example`)
- `./deploy.sh` prompts: use local / edit / editor / skip sync

## Architecture

- Build on laptop (Go linux/amd64 + Next standalone → `frontend.tar.gz`)
- Rsync to VPS; bind-mount artifacts; prune after successful deploy
- Nginx templates from `.env` domains/ports

## DNS + TLS

Point A records for domains in `deploy/.env` at `204.48.30.58`, then `./deploy.sh remote` with `ECOMM_MODE=3`.
