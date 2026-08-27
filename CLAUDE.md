# CLAUDE.md

Guidance for working in this repository.

## Commands

```bash
# Infrastructure
docker compose up -d          # postgres, redis, flyway migrate, backend on :8081
make migrate                  # re-run Flyway migrations
make seed                     # load db/seed.sql demo data

# Backend (host)
cd backend
go build ./...
go vet ./...
go run ./cmd/api              # needs DATABASE_URL, REDIS_ADDR (see .env.example)

# E2E (frontend UI not required for API; specs target :3000)
cd tests && npm install && npx playwright test
```

## Architecture

- **Backend:** Go/Fiber (`backend/`), PostgreSQL schema in `db/migrations/V1__init.sql`
- **Storefront API:** `backend/internal/routes/public.go` → `/api/*`
- **Admin API:** `backend/internal/routes/admin.go` → `/api/admin/*` (JWT via `POST /api/admin/login`)
- **Presence:** Redis sorted sets (`presence:product:<id>`)
- **Stylist:** Claude API streaming when `ANTHROPIC_API_KEY` set; style quiz answers in Redis (no quiz table in V1)
- **Admin auth:** env-based single admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`) — no `admin_users` table
- **Frontend:** Next.js planned; not implemented past backend gate — see `docs/backend_test_results.md`

## Spec

Full feature scope: `docs/ecommerce-feature-list.md`  
Backend task checklist: `docs/backend_tasks.md` (stop at UI/UX REVIEW GATE)

## Key modeling notes

- Product bundles: `products.is_bundle` + `bundle_items`
- CMS: `content_blocks`, `highlights`, `curated_shelves`, `stats_counters`
- Recent-purchase ticker: real `orders` data, names obfuscated in API
- M-Pesa: Daraja STK + callback implemented; live sandbox verify deferred (task 4 skipped)
