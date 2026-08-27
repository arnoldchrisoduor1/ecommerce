# Scaffold: schema, routes, tests

This covers the first three build steps referenced in `docs/SPEC.md`:
DB schema, Go/Fiber route skeleton, and Playwright test scaffolding —
one test file per major feature section.

## What's here

```
db/migrations/V1__init.sql         Full Postgres schema (Flyway migration)
backend/cmd/api/main.go            Fiber app entrypoint
backend/internal/routes/public.go  Storefront-facing routes (SPEC §1-9)
backend/internal/routes/admin.go   Admin/CMS routes (SPEC §11-12)
backend/internal/handlers/         Stub handlers (501 Not Implemented)
backend/internal/middleware/auth.go Admin auth stub — MUST be replaced
tests/playwright.config.ts         Playwright config
tests/e2e/landing.spec.ts          §1 Landing page
tests/e2e/catalog-and-pdp.spec.ts  §2-4 Shop, PDP, bundles
tests/e2e/cart-and-checkout.spec.ts §6-7 Cart, exit-intent, checkout
tests/e2e/admin-dashboard.spec.ts  §11-12 Admin + CMS
```

## How every handler is stubbed

Every route in `public.go` / `admin.go` maps to a handler in
`handlers.go` that currently returns `501 Not Implemented`. This is
intentional — it lets you compile and run the server immediately,
point Playwright at real (empty) endpoints, and implement handlers
incrementally without breaking route wiring.

## Recommended order for Claude Code sessions

1. **Migrations first** — run `make migrate` (see "Database migrations"
   below), verify it applies cleanly, seed a handful of test products/variants.
2. **Catalog handlers** (`ListProducts`, `GetProductBySlug`, etc.) —
   unblocks the landing + shop + PDP Playwright specs.
3. **Cart + checkout handlers** — unblocks `cart-and-checkout.spec.ts`.
   M-Pesa STK push and the callback webhook are their own sub-task;
   don't bundle them with the cart CRUD work.
4. **Admin auth** — replace `middleware/auth.go` before touching any
   admin handler. Every admin Playwright spec assumes a real
   authenticated session (via a Playwright `storageState` fixture —
   add an `auth.setup.ts` once login exists).
5. **Admin + CMS handlers** — unblocks `admin-dashboard.spec.ts`.
6. **AI stylist chat + presence/live-viewer count** — these depend on
   Redis and the Claude API respectively; treat as their own session.

## Running the tests

Each spec uses `data-testid` selectors. As you build each page in
Next.js, add matching `data-testid` attributes — the tests are written
against the SPEC.md feature list, not against implementation details,
so they should stay stable as the UI design changes.

```bash
cd tests
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

## Note on presence / live viewer counts

These are intentionally NOT in the Postgres schema — see the comment
at the bottom of `V1__init.sql`. Use Redis sorted sets keyed by
product ID, scored by last-heartbeat timestamp, so stale sessions
expire naturally.

## Database migrations

Migrations run via [Flyway](https://flywaydb.org/), configured in
`flyway.conf` and wired into `docker-compose.yml`.

Naming convention: `V<version>__<description>.sql` in `db/migrations/`
(e.g. `V1__init.sql`). Never edit an already-applied migration — add a
new `V<n+1>__...sql` file instead.

```bash
# start Postgres + apply all pending migrations
docker compose up

# run migrations manually against a running Postgres
make migrate

# check applied/pending migration status
make migrate-info

# validate applied migrations match local files (used in CI)
make migrate-validate
```

Flyway connects via `FLYWAY_URL` / `FLYWAY_USER` / `FLYWAY_PASSWORD`
(set in `docker-compose.yml`, derived from `POSTGRES_*` vars). Flyway
needs a JDBC URL (`jdbc:postgresql://...`), so it does not reuse the
backend's `DATABASE_URL` (`postgres://...`) directly.
