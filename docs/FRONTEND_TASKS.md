# Frontend build tasks — run iteratively, one page/section at a time

Rules for whoever (human or agent) is executing this file:
- Work top to bottom. Do not skip ahead.
- After each task, run its **Verify** step. Do not mark a task done or
  move to the next one until Verify passes.
- Every component MUST use tokens from design-system/ecommerce-storefront/
  tokens.css and components.css. No ad-hoc hex colors, font sizes, or
  spacing values — if a value isn't in the token set, flag it as a new
  task to add the token rather than hardcoding it.
- If Verify fails, insert a new task immediately below the current one
  describing the fix, complete it, re-run Verify, then continue.
- Reference the wireframes described in this conversation (landing,
  PDP, cart/checkout, admin) for structure/layout, and
  docs/ecommerce-feature-list.md for feature scope. Reference
  design-system/ecommerce-storefront/MASTER.md for all visual decisions.
- Backend API endpoints are implemented per docs/BACKEND_TASKS.md —
  point real fetches at them; don't mock data once an endpoint exists.
- Add `data-testid` attributes matching the selectors already used in
  tests/e2e/*.spec.ts as you build each element (see that folder for
  exact expected names).
- **Pause after each major page section (marked with 🔍 REVIEW) for
  manual sign-off before continuing to the next one.**

---

## 1. Design system integration
### 1.0 Missing tokens (found while starting task 1)
- **Why added:** `components.css` still hardcodes `#262626` (primary
  hover), `6px` presence dot, `2px` paddings/borders, and fixed rem
  modal/highlight widths — forbidden by the token-only rule.
- [x] Add tokens for those values in tokens.css; update components.css
      to reference them only.

### 1.0b Font token collision (found during Verify)
- **Why added:** `--font-body` was defined twice (family then size). The
  size overwrote Montserrat, so `font-family: var(--font-body)` resolved
  to `1rem` in the browser.
- [x] Rename families to `--font-family-display` / `--font-family-body`;
      keep size tokens as `--font-body` / `--font-display-*`. Update
      components.css + synced frontend copies. Re-verify style-guide.
### 1.0c Card min width token (found during Verify)
- **Why added:** style-guide grid used hardcoded `12rem` minmax.
- [x] Add `--size-card-min` to tokens.css; style-guide uses the token only.
### 1.1 App wiring + base components
- [x] Wire tokens.css and components.css into the Next.js app (global
      import, verify CSS custom properties resolve in the browser).
- [x] Load Cormorant + Montserrat via the Google Fonts URL in MASTER.md,
      confirm both weights ranges load correctly.
- [x] Build base components as real React components: Button (primary/
      accent/secondary/ghost/danger variants, 3 heights), Badge (sale/
      stock states/quiet presence), Modal (with scrim + offer variant),
      Card (product + panel variants).
- **Verify:** Render each component variant in a temporary /style-guide
  route, visually confirm against components.css spec. No hardcoded
  values in the component code — everything pulled from tokens.
  **Passed** (2026-08-27): `/style-guide` — Montserrat body, Cormorant
  display; all button/badge/card/modal variants present; CSS vars only.

## 🔍 REVIEW — component library
Stop here. Confirm the base component set matches the approved design
system before building any real page.

## 2. Landing page
### 2.0 Missing newsletter endpoint (found while starting task 2)
- **Why added:** No public `POST /api/...` for email capture exists in
  the backend. E2E expects success UI after submit.
- [x] Client-side validate + show `email-capture-success` until a real
      subscribe endpoint is added (do not invent a fake store).
### 2.0b Landing tokens / media (found during Verify)
- **Why added:** Needed announce dwell, float z-index, hero min-height,
  on-fg text; external placehold.co hung Playwright `load`.
- [x] Add `--duration-announce`, `--z-float`, `--hero-min-height`,
      `--color-on-fg`; seed media → `/media/*.svg`; self-host fonts.
- [x] Announcement bar (rotating messages, per SPEC §1)
- [x] Main nav (logo, links, search/wishlist/cart icons)
- [x] Highlights reel (circular avatars, tappable, story viewer)
- [x] Hero section (headline at --font-display-xl, CTA) — pull content
      from GET /api/content/blocks/hero, don't hardcode copy
- [x] New arrivals grid — pull from GET /api/catalog/products
- [x] Featured reviews section — pull from GET /api/reviews/featured
- [x] Style guide / blog feed preview — pull from GET /api/content/blog
- [x] Email capture module + stats counter — pull from GET /api/content/stats
- [x] AI stylist chat launcher (floating, persistent)
- **Verify:** Run `tests/e2e/landing.spec.ts` — all tests pass against
  real seeded data, not mocks.
  **Passed** (2026-08-27): 10/10 (chromium + mobile-safari) against
  seeded API on `:8081` + production Next on `:3000`.

## 🔍 REVIEW — landing page
Stop here for manual visual review before continuing.

## 3. Category / shop page + Product detail page
- [ ] Shop grid: filters, sort, pagination, quick-view modal, live
      viewer badges — pull from GET /api/catalog/products with query params
- [ ] PDP: gallery, variant selectors, size chart modal, live viewer +
      high-demand tag, related products, add-to-bag/wishlist, trust
      badges, reviews section
- [ ] Bundle detail page variant of PDP
- **Verify:** Run `tests/e2e/catalog-and-pdp.spec.ts` — all pass.
  Manually confirm product names in Cormorant at --font-display-sm
  render legibly at 375px width (per the earlier type preview check).

## 🔍 REVIEW — shop + PDP
Stop here for manual visual review before continuing.

## 4. Cart, exit-intent, checkout
- [ ] Cart drawer: line items, qty controls, free-delivery progress bar
- [ ] Exit-intent modal: offer hierarchy, live claim counter from
      GET /api/discounts/:code/claims-today
- [ ] Recent purchase ticker (ambient corner toast) — pull from
      GET /api/activity/recent-purchases
- [ ] Checkout: 3-step flow (delivery/payment/confirm), delivery quote,
      Pesapal payment initiation, promo code field, order confirmation
- **Verify:** Run `tests/e2e/cart-and-checkout.spec.ts` — all pass.
  Manually trigger exit-intent (mouse to top of viewport) and confirm
  it fires once per session, not repeatedly.

## 🔍 REVIEW — cart + checkout
Stop here for manual visual review before continuing.

## 5. Customer account pages
- [ ] Order history + tracking status
- [ ] Wishlist page
- [ ] Saved addresses
- [ ] Gift card purchase/redemption
- [ ] Standalone order tracking (no login) page
- **Verify:** Manually create a test order, confirm it appears in order
  history with correct status.

## 6. Admin dashboard
- [ ] Sidebar nav + overview stat cards (orders today, revenue, active
      viewers, discount claims) — use density override from
      design-system/ecommerce-storefront/pages/admin.md
- [ ] Product/variant/bundle management CRUD screens
- [ ] Order management screen
- [ ] Discount management screen
- [ ] Customer list
- [ ] Reviews moderation (approve/feature)
- [ ] CMS screens: hero editor, announcement bar editor, highlights
      manager (reorder), curated shelf editor, blog editor, stats
      counter override
- [ ] Low stock alerts panel
- **Verify:** Run `tests/e2e/admin-dashboard.spec.ts` — all pass.
  Manually edit the hero content block and confirm the live landing
  page reflects the change immediately (per SPEC §12).

## 🔍 REVIEW — admin dashboard
Stop here for manual visual review before continuing.

## 7. AI stylist chat + style quiz UI
- [ ] Chat panel UI: message list, input, streaming response display
- [ ] Style quiz flow UI
- **Verify:** Send a real styling question through the UI, confirm a
  streamed, catalog-grounded response renders correctly and
  add-to-cart-from-chat (if implemented) works.

## 8. Full-site pass
- [ ] Run every spec in tests/e2e/*.spec.ts end to end.
- [ ] Mobile responsiveness pass at 375/768/1024/1440 breakpoints per
      MASTER.md.
- [ ] Accessibility pass: keyboard focus rings (--focus-ring token),
      contrast spot-checks on any new color combinations introduced
      during page-building.
- **Verify:** Document final pass/fail state of every spec file and any
  remaining known gaps.