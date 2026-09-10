# Production deployment — ecommerce platform

## Recon summary (server `ubuntu@3.109.5.252` / `ip-172-26-7-170`)

| Item | Finding |
|------|---------|
| Deploy home | `/home/ubuntu/ecommerce` (alongside `digitalwilderness`, `emailservice`, `portfolio_v3`) |
| Swap | **6GB already** (`/swapfile` 2G + `/swapfile2` 4G) — server script skips creating more |
| RAM | ~414MB — stack uses loopback-bound ports + memory limits; expects swap |
| Disk | ~19GB root, ~5–6GB free — script prunes Docker cache if &lt;2.5GB free |
| Nginx | Existing sites for portfolio/mailer/wilderness; **no** ecommerce sites yet (created fresh) |
| Pattern | Host nginx → `127.0.0.1:<port>` (same as other apps) + Certbot |
| Arch | `x86_64` |

## SSH / PEM setup

1. Key lives at `%USERPROFILE%\.ssh\digitalwilderness-1.pem` (moved out of OneDrive; permissions locked with `icacls`).
2. SSH config host alias:

```
Host dw-ecomm
    HostName 3.109.5.252
    User ubuntu
    IdentityFile ~/.ssh/digitalwilderness-1.pem
    IdentitiesOnly yes
```

3. Connect with: `ssh dw-ecomm`  
   Never pass the raw `.pem` path or IP in deploy scripts.

WSL users: mirror the same `Host dw-ecomm` block in `~/.ssh/config` (scripts use WSL `rsync`/`ssh`).

## Architecture

- **No compile on the server.** Laptop builds:
  - Go binary → `GOOS=linux GOARCH=amd64`
  - Next.js `output: 'standalone'`, then **WSL packaging** so Windows symlinks become real files for Linux, shipped as `frontend.tar.gz`
- Artifacts rsync’d to the VPS over `dw-ecomm`
- Server `docker compose` only **COPY**s artifacts into slim runtime images (build context = `deploy/`)
- Nginx terminates TLS and proxies:
  - `ecommerce.oduor-arnold.com` → `127.0.0.1:3080` (frontend)
  - `ecomm-api.oduor-arnold.com` → `127.0.0.1:8081` (API)
  - `ecomm-api.oduor-arnold.com/media/` → MinIO bucket

## DNS + TLS

Containers and nginx are verified healthy over HTTP. Let's Encrypt currently reports **NXDOMAIN** for both subdomains — public HTTPS will work only after A records exist:

| Host | Type | Value |
|------|------|-------|
| `ecommerce.oduor-arnold.com` | A | `3.109.5.252` |
| `ecomm-api.oduor-arnold.com` | A | `3.109.5.252` |

After DNS propagates, on the server run menu option **3** (`Nginx + certbot only`) or:

```bash
ssh dw-ecomm
cd ~/ecommerce && bash scripts/deploy-server.sh   # choose 3
```

Certbot failure is non-fatal on first deploy so the stack still comes up on HTTP.

## How to run

### Local (Windows)

```powershell
cd C:\dev\ecommerce
.\scripts\deploy-local.ps1
```

**Menu**

| # | Action |
|---|--------|
| **1 (default)** | Build FE+BE, git commit/push, rsync, run server script |
| 2 | Frontend only (build + sync) |
| 3 | Backend only (build + sync) |
| 4 | Sync existing artifacts (no rebuild) |
| 5 | Build only (no git / no sync) |
| 6 | Build FE+BE, commit/push only (no sync) |

Press Enter to accept defaults. Confirm before slow/destructive steps.

### Server

After a sync (or from menu option 1):

```bash
ssh dw-ecomm
cd ~/ecommerce
bash scripts/deploy-server.sh
```

**Menu**

| # | Action |
|---|--------|
| **1 (default)** | Swap check + ports + compose up + **seed** + nginx/ssl + health |
| 2 | Compose only (rebuild/restart + **seed**) |
| 3 | Nginx + certbot only |
| 4 | Health checks only |
| 5 | Seed database only (`db/seed.sql` → postgres) |

## Logs

- Local: `deploy-logs/local-deploy-<timestamp>.log`
- Server: `~/ecommerce/deploy-logs/server-deploy-<timestamp>.log`

Long steps print a heartbeat every ~10–20s so the terminal is never silent for minutes.

## Repo layout

```
deploy/
  docker-compose.prod.yml
  Dockerfile.backend
  Dockerfile.frontend
  nginx/
    ecommerce.oduor-arnold.com
    ecomm-api.oduor-arnold.com
  artifacts/          # gitignored build outputs
scripts/
  deploy-local.ps1
  deploy-server.sh
DEPLOYMENT.md
```

## Secrets

Production env vars currently live in `deploy/docker-compose.prod.yml` (same approach as local compose). Change `ADMIN_*`, DB, and MinIO passwords before real traffic.

## Why rsync (not git-pull for artifacts)

Git holds source + infra. Build outputs (`deploy/artifacts/`) are large/binary and platform-specific; rsync over `dw-ecomm` pushes only what the server needs without compiling on the VPS.
