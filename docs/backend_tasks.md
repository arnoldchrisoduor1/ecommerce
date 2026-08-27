# Backend build tasks — run iteratively, one at a time

Rules for whoever (human or agent) is executing this file:
- Work top to bottom. Do not skip ahead.
- After each task, run its **Verify** step. Do not mark a task done or
  move to the next one until Verify passes.
- If Verify fails, insert a new task immediately below the current one
  describing the fix needed, complete it, re-run Verify, then continue.
- If a task surfaces a requirement that isn't covered here (e.g. a
  missing table, an ambiguous business rule), insert a new task for it
  in place, note why it was added, and continue — don't silently
  improvise undocumented behavior.
- Reference docs/ecommerce-feature-list.md and db/migrations/V1__init.sql
  as the source of truth for scope and schema.
- **STOP at the "UI/UX REVIEW GATE" marker near the bottom.** Do not
  proceed past it under any circumstances — that section requires
  manual review before any frontend visual work begins.

---

## 1. Cart handlers
- [x] Implement CreateCart, GetCart, AddCartItem, UpdateCartItem, RemoveCartItem
      in handlers.go against cart/cart_items tables.
- [x] Handle both guest (session_id) and logged-in (customer_id) carts.
- **Verify:** `go build ./... && go vet ./...` clean. Manually hit
  POST /api/cart, POST /api/cart/:id/items, GET /api/cart/:id via curl
  and confirm items persist and subtotal is computable from returned data.

## 2. Discounts
- [x] Implement GetDiscount, ClaimDiscount, DiscountClaimsToday against
      discounts/discount_claims tables.
- [x] ClaimDiscount must respect max_claims, active_from/active_to,
      is_active before recording a claim.
- **Verify:** Seed one discount row, claim it twice from different
  session_ids, confirm DiscountClaimsToday count increments correctly
  and a claim past max_claims is rejected with a clear error.

## 3. Checkout — order creation (no payment yet)
- [x] Implement CreateOrder: validate cart, snapshot shipping_address,
      compute subtotal/delivery_fee/discount_amount/total, write
      orders + order_items in a single DB transaction, decrement
      variant stock_qty.
- [x] Implement DeliveryQuote as a stub returning a fixed test quote
      (real courier integration is a separate task below).
- **Verify:** Full flow via curl: create cart → add item → POST
  /api/checkout/quote → POST /api/checkout → confirm an order row and
  matching order_items exist, and variant stock_qty decremented.

## 4. M-Pesa payment integration — SKIPPED (user directive)
- [x] Implement InitiateMpesaSTK / MpesaCallback (code landed; STK live
      verify deferred).
- [ ] **Verify skipped** — Daraja sandbox credentials not provided.
      Revisit when payment integration is prioritized.

## 5. Admin auth (replace stub — required before anything below)
- [x] Replace middleware/auth.go stub with real JWT or session-based
      auth. Add an admin login endpoint.
- **Decision:** No `admin_users` table in V1 schema — single admin via
      `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars, JWT signed with
      `ADMIN_JWT_SECRET`.
- **Verify:** Unauthenticated request to any /api/admin/* route returns
  401. Authenticated request with a valid token/session succeeds.

## 6. Admin: products, variants, bundles
- [x] Implement all Admin*Product*, Admin*Variant*, Admin*Bundle*
      handlers as full CRUD against their tables.
- **Note:** AdminUploadProductImage still 501 — MinIO not wired yet.
- **Verify:** Create, update, and delete a product with a variant via
  curl/Postman against the admin endpoints; confirm DB state matches
  at each step.

## 7. Admin: orders, discounts, customers, reviews
- [x] Implement AdminListOrders, AdminGetOrder, AdminUpdateOrderStatus.
- [x] Implement Admin*Discount* CRUD.
- [x] Implement AdminListCustomers, AdminGetCustomer.
- [x] Implement AdminListReviews, AdminUpdateReviewStatus, AdminSetReviewFeatured.
- **Verify:** Each endpoint exercised via curl with a valid admin
  token; confirm expected DB state changes.

## 8. CMS: content blocks, highlights, curated shelves, blog, stats
- [x] Implement GetContentBlock / AdminUpdateContentBlock (hero,
      announcement_bar, footer keys).
- [x] Implement ListHighlights / Admin*Highlight* CRUD.
- [x] Implement GetCuratedShelf / AdminUpdateCuratedShelf.
- [x] Implement blog list/get + admin CRUD.
- [x] Implement GetStatsCounters / AdminSetStatsCounter.
- **Verify:** Update the hero content block via admin endpoint, then
  confirm GET /api/content/blocks/hero reflects the change immediately.

## 9. Reviews (public submission) + Recent purchase feed
- [x] Implement ListFeaturedReviews, ListProductReviews, SubmitReview
      (new reviews default to status='pending').
- [x] Implement RecentPurchases reading from real order data (join
      orders + order_items + products, most recent N, obfuscate
      customer name to first-name-only or similar).
- **Verify:** Submit a review, confirm it does NOT appear in
  ListFeaturedReviews until an admin approves + features it.

## 10. Presence / live viewer count (Redis)
- [x] Implement PresenceHeartbeat (ZADD session with timestamp score)
      and PresenceCount (ZREMRANGEBYSCORE stale entries, then ZCARD).
- **Verify:** Simulate 3 heartbeats from different session IDs for one
  product, confirm PresenceCount returns 3; wait past the expiry
  window, confirm it drops back down.

## 11. AI stylist chat + style quiz
- [x] Implement StylistChat: call Claude API with product catalog as
      context (RAG over active products), stream the response.
- [x] Implement SubmitStyleQuiz: store quiz answers, return a filtered
      product recommendation list.
- **Decision:** No `style_quiz` table in V1 — answers in Redis
      (`style_quiz:<session_id>`, 7-day TTL).
- **Verify:** Style quiz pass. Stylist chat stream needs
      `ANTHROPIC_API_KEY` (503 without it).

## 12. Seed data + full backend test pass
- [x] Write a seed script populating categories, ~20 products with
      variants/images, 2 bundles, 1 discount, a hero content block,
      3 highlights, and a few reviews (`db/seed.sql`, `make seed`).
- [x] Run every Playwright spec in tests/e2e/*.spec.ts.
- **Verify:** Documented in `docs/backend_test_results.md` — 47/48
      specs blocked on missing frontend UI or WebKit; backend APIs OK.

---

## 🛑 UI/UX REVIEW GATE — STOP HERE

Backend implementation is complete once task 12 is verified. Do NOT
begin frontend visual/UI work, apply the ui-ux-pro-max skill, or touch
Next.js page components past this point. Wait for explicit manual
review and go-ahead before proceeding to frontend/UI tasks.