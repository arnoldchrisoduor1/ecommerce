- If a task is ambiguous or conflicts with existing code, STOP and ask before implementing. Do not guess schema names — read the existing models first.
- Every new DB change goes in a numbered migration file. No hand-edited schemas.
- All new backend endpoints get a table-driven Go test. All new analytics writes must be non-blocking (fire-and-forget goroutine or Redis queue) so they never slow a page render.
- Reuse the existing theme tokens (the brown/warm palette). Do not introduce new hex codes outside the token file.

Start by reading the repo and printing a short inventory: existing product model, existing admin routes, existing theme token file, existing newsletter storage, and whether any auth scaffolding already exists. Then begin Task 1.

---

## TASK 1 — Product search

The top-nav search button currently 404s.

- Backend: `GET /api/products/search?q=&page=&limit=` — case-insensitive partial match across product **name** and **description**. Use Postgres `ILIKE` with trigram index (`pg_trgm`, GIN index on both columns) so it stays fast. Rank name matches above description matches. Exclude unpublished/hidden products per existing visibility rules.
- Frontend: `/search` page reading `?q=`. Shows result count, the same product card component used on listings, empty state ("No products match …" with 3–4 suggested categories), and a loading skeleton.
- Nav search: debounced 250ms typeahead dropdown showing top 5 matches with thumbnail + name + price; Enter goes to the full `/search` page. Keyboard navigable (arrow keys, Escape closes).

**Verification:** curl the endpoint with (a) a term appearing only in a description, (b) a term appearing only in a name, (c) mixed case, (d) a nonsense string. Show all four outputs. Then confirm `/search?q=` renders results and the 404 is gone.

---

## TASK 2 — Profile page restyle

- Apply the warm/brown theme properly: sectioned cards with subtle elevation, warm neutral surfaces, accent brown for primary actions only.
- Tabs or a sidebar for Wishlist / Orders / Account, with the active state clearly marked.
- Wishlist items: image, name, price, move-to-cart and remove actions.
- Orders: status pill (colour-coded — pending / paid / shipped / delivered / cancelled), order number, date, total, expandable line items.
- Proper empty states with an illustration or icon for each tab, not bare text.
- Fully responsive; test at 375px, 768px, 1440px.

**Verification:** Screenshot each tab at all three breakpoints, in both populated and empty states.

---

## TASK 3 — AI stylist button, modal, and unconfigured state

- Replace the brown rectangle trigger with a properly designed floating action button: theme gradient or accent fill, icon + label, subtle idle animation (slow pulse or shimmer), hover lift, spring-in entrance. Respect `prefers-reduced-motion`.
- Fix the modal close button: position it correctly inside the modal bounds (top-right, inset from the edge, above all content in z-order), min 44x44 hit target, hover state, and make Escape + backdrop click also close.
- The AI backend isn't built yet. Replace the current "not configured" text with a themed empty state inside the modal: a stylist icon, heading "AI Stylist is warming up", body text "AI credentials not provided — this feature will be available shortly.", styled in theme colours, with the input area visibly disabled rather than absent.

**Verification:** Screenshot the button idle + hover, modal open, close via all three methods, and the unconfigured state.

---

## TASK 4 — Hero image cropping

Full-body uploads render torso-only on desktop (fine on mobile).

Root cause is a fixed desktop hero height plus `object-cover` centre-cropping a portrait image. Fix as follows:

- Replace the fixed height with an aspect-ratio-driven container: portrait-friendly on mobile, and on desktop use a ratio that preserves the subject (e.g. `aspect-[16/9]` with the image sized to `h-full w-auto` inside a flex-centred container) — do not simply switch to `object-contain`, which will letterbox and break the layout.
- Add `focal_x` / `focal_y` fields (0–1 floats, default 0.5/0.5) to the hero slide model and admin upload form, wired to `object-position: calc(focal_x*100%) calc(focal_y*100%)`. Give the admin a click-to-set focal point preview.
- Serve responsive `srcset` sizes so desktop gets the full-resolution asset.
- Do not change mobile behaviour — it already renders correctly. Verify it still does after the change.

**Verification:** Load a known full-body portrait image. Screenshot the hero at 375 / 768 / 1440 / 1920 showing head and feet visible. Change the focal point in admin and screenshot the resulting shift.

---

## TASK 5 — Modern footer

- Multi-column on desktop, accordion on mobile: brand blurb + logo, Shop (categories), Help (shipping, returns, contact, FAQ), Company (about, blog).
- Newsletter signup with inline validation, loading state, success and duplicate-email states. Wire to the existing newsletter endpoint — do not create a new one, but confirm it persists the email (Task 16 depends on this).
- Social icons, payment method badges, copyright line with dynamic year.
- Warm dark surface from the theme tokens, generous vertical rhythm, subtle top border or gradient divider.

**Verification:** Screenshot at all three breakpoints. Confirm the newsletter form hits the existing endpoint, shows all three states, and that the email lands in the database.

---

## TASK 6 — Multi-image highlights with caption overlay

- Schema: new `highlight_slides` table (`id`, `highlight_id`, `image_url`, `caption`, `caption_position`, `sort_order`). Migrate existing single images into it as slide 1. Do not drop the old column until the migration is verified.
- Admin: add/reorder/delete slides per highlight (drag to reorder), caption text field per slide, position selector (top / centre / bottom).
- Storefront: Instagram-story behaviour — segmented progress bars at the top (one per slide), auto-advance ~5s, tap left/right to navigate, swipe on mobile, pause on hold.
- Caption overlays the image with a gradient scrim behind it for legibility, positioned per the slide's setting, with a readable text shadow.

**Verification:** Create a highlight with 3 slides and captions. Show the progress bars advancing, tap navigation both directions, and caption legibility over both a light and a dark image. Confirm pre-existing single-image highlights still render.

---

## TASK 7 — Viewer count overlay on PDP

- Position: top-right of the main product image, inset ~16px, absolutely positioned above the image.
- Style: theme background pill with slight transparency + backdrop blur, small pulsing dot, text like "12 viewing now".
- Hide when the count is below a threshold (e.g. < 2) rather than showing "1 viewing".
- Must not overlap the zoom control or wishlist icon — reposition those if needed.
- Animate count changes (fade/slide the number, not a hard swap).

**Verification:** Screenshot on a product with a live count, and confirm it hides below threshold. Test on a light product image and a dark one for contrast.

---

## TASK 8 — Social proof activity ticker (storefront)

Between the hero and New Arrivals, add a continuously scrolling activity ticker fed by **real** events — no seeded or fake data.

- Backend: `GET /api/activity/recent?limit=20` returning real recent events of types: `purchase`, `wishlist_add`, `cart_add`, `newsletter_signup`.
- **Public payload contains first name + item name only.** Never surname, email, order value, or user ID. If a user has no first name, fall back to "Someone".
- No time filter — return the most recent N regardless of age, so the ticker is never empty. If fewer than N exist, loop what's available.
- Messages: "Carol bought {item}", "Kevin saved {item}", "Francie added {item} to cart", "{name} signed up for the newsletter". Each row: small product thumbnail (or an icon for newsletter events), the message, and a relative timestamp.
- Frontend: horizontal marquee, seamless infinite loop, pauses on hover, respects `prefers-reduced-motion` (falls back to a static row or slow fade rotation). Cache the response in Redis for 30s.
- Render nothing at all if the endpoint returns zero events — never render an empty container.
- Persist every one of these events to an `activity_events` table (`id`, `type`, `user_id`, `product_id`, `order_id`, `price_at_event`, `created_at`) — Task 15 reads from it. Emit the event from the existing purchase / wishlist / cart / newsletter handlers rather than a separate tracking call.

**Verification:** Perform one real action of each of the four types and show them appearing in the ticker. Show the raw endpoint output and confirm no surname, email, price, or ID is present. Confirm the loop is seamless and hover-pause works.

---

## TASK 9 — Back-to-top button

- Appears after ~600px scroll, fades/slides in, bottom-right, offset so it never collides with the AI stylist FAB or the demo mascot from Task 17 (define a single shared stacking order for all three).
- Smooth scroll to top, theme-styled circular button with a hover lift.
- Respects `prefers-reduced-motion` (instant jump instead of smooth scroll).

**Verification:** Screenshot showing the button and the stylist FAB coexisting without overlap, at mobile and desktop.

---

## TASK 10 — Admin: most-viewed products + per-user view detail

First, build the shared analytics foundation that Tasks 10, 11 and 14 all depend on:

- Table `page_views`: `id`, `session_id`, `user_id` (nullable), `path`, `entity_type` (product/blog/page), `entity_id` (nullable), `started_at`, `ended_at`, `duration_seconds`, `referrer`, `user_agent`, `ip_hash`.
- Table `sessions`: `id`, `user_id` (nullable), `first_seen`, `last_seen`, `ip_hash`.
- Frontend sends a heartbeat every 15s while a page is visible (use the Page Visibility API so background tabs don't inflate numbers) and a `sendBeacon` on unload to close the record.
- Writes must be non-blocking. Index on `(entity_type, entity_id, started_at)` and `(user_id, started_at)`.

Then, in the admin Overview:

- "Most Viewed Products" table: rank, thumbnail, name, total views, unique viewers, avg time on page, with a date-range selector.
- Clicking a row opens a modal listing each viewer: name (or "Guest · session abc123" for anonymous), view count, total time spent, last viewed. Sortable, paginated.

**Verification:** Browse 3 products in different tabs for varying durations. Show the Overview table reflecting it, and open the modal showing your own session with correct counts and durations. Confirm background tabs did not accumulate time.

---

## TASK 11 — Admin: traffic and presence tracking

- "Most Visited Pages" table: path, views, unique visitors, avg duration, for a selectable range.
- Active users counters: last 1 hour / 12 hours / 24 hours / 7 days / 30 days, as stat cards with a sparkline trend.
- "Currently online" count (sessions with a heartbeat in the last 5 minutes), live-updating via polling every 30s.
- Customers list gains a "Last seen" column with relative time and a green dot for currently-online.
- Cache the aggregate counters in Redis with a 60s TTL — do not recompute on every dashboard load.

**Verification:** Show each counter with real numbers. Open a second browser session and confirm "currently online" increments, then decrements after the timeout.

---

## TASK 12 — Admin colour pass

- Apply the theme palette as an admin variant: warm neutral surfaces, brown accent for primary actions and active nav, semantic colours for status (green success, amber warning, red danger, blue info).
- Stat cards get accent left-borders or tinted icon chips. Charts use a coherent theme-derived palette, not library defaults.
- Sidebar: clear active state, hover states, section grouping.
- Tables: zebra striping, hover rows, coloured status pills.
- Keep all text contrast at WCAG AA minimum. Do not sacrifice legibility for colour.

**Verification:** Screenshot every admin page before and after. Run a contrast check on the primary text/background and accent/background pairs and report the ratios.

---

## TASK 13 — Authentication with action gating and optional email 2FA

The system currently has no auth. Build it.

**Architecture:**
- Backend: email + password (bcrypt, cost 12), JWT access token (15 min) in memory + refresh token (30 days) in an httpOnly, Secure, SameSite=Lax cookie. Refresh rotation with reuse detection.
- Tables: `users`, `refresh_tokens`, `verification_codes` (`user_id`, `code_hash`, `purpose`, `expires_at`, `attempts`, `consumed_at`).
- Endpoints: register, login, logout, refresh, me, request-code, verify-code, resend-code, forgot-password, reset-password.
- Rate limit by IP and by email: 5 login attempts / 15 min, 3 code requests / 15 min. Return generic errors — never reveal whether an email exists.

**Action gating:**
Browsing stays fully open. Auth is required only for: add to wishlist, save item, place order, and any profile page.
Implement a **pending-action queue**: when a guest clicks a gated action, store the intended action (type + payload) in client state, open the auth modal, and on successful auth **replay the action automatically** and show a confirmation toast. The user must never have to click the same button twice.

**2FA — optional, suggested at signup:**
- 2FA is **never mandatory** for any action, including orders.
- Immediately after successful account creation, show a well-designed suggestion step: a short benefit line ("Add an extra layer of security to your account"), an "Enable two-step verification" primary button, and a clearly visible "Maybe later" secondary. Skipping must take one click and must not re-prompt on every login — at most one gentle reminder banner in the profile page afterwards, dismissible for good.
- Store the choice on the user record (`two_factor_enabled`, `two_factor_prompted_at`). Toggleable any time from the profile.
- 2FA **is** always required for password reset, regardless of the user's setting.

**Pages/components:**
- Auth modal with Login / Create Account tabs (also available as standalone `/login`, `/signup`, `/verify` routes for direct links and email flows).
- Password strength meter on signup, show/hide toggle, inline validation.
- Verification page: 5 separate digit inputs with auto-advance, paste support for the full code, auto-submit on completion, 60s resend cooldown with a visible countdown, clear error state on wrong code, lockout after 5 wrong attempts.
- Codes: 5 digits, 10 minute expiry, single-use, hashed at rest, sent via the existing mailer microservice with a templated branded email.

**Verification:** Demonstrate end to end — (1) guest clicks wishlist → modal → signup → 2FA suggestion appears → "Maybe later" → wishlist item is added automatically without re-clicking; (2) a second signup that enables 2FA, receives the code, and verifies; (3) confirm a 2FA-disabled user can place an order without any code prompt; (4) logout clears state; (5) wrong code 5x locks out; (6) expired code rejected; (7) refresh token rotation works after access token expiry. Paste output for each.

---

## TASK 14 — Blog read analytics

- Track per-post: currently reading (active in last 5 min), total accumulated reads, unique readers, average read time, and scroll-depth completion rate (fired at 25/50/75/100%).
- A read counts once per session per post — do not double-count refreshes within the same session.
- Storefront: "N reading now" pill on the post (same visual treatment as the PDP viewer count) and a total read count on blog cards and the post header.
- Admin: blog analytics table — post, total reads, unique readers, currently reading, avg read time, completion rate — sortable, with a date-range filter.

**Verification:** Open a post in two sessions, show "2 reading now", close one and confirm it drops after the timeout. Show the admin table with accurate totals. Confirm a refresh does not increment the total.

---

## TASK 15 — Admin: Activity feed

New admin sidebar item, "Activity". This is the privileged view of the same `activity_events` data the public ticker uses — here it shows full detail.

- Reverse-chronological feed with infinite scroll or pagination. Each row shows:
  - Event type icon + coloured pill (purchase / wishlist / cart / newsletter).
  - Full customer name, and email (or "Guest" for anonymous sessions), linked to the customer detail page where one exists.
  - Product thumbnail, full product name **hyperlinked to the product page**, and the price at the time of the event.
  - For purchases: order number linked to the order detail, and order total.
  - Exact timestamp on hover, relative time in the row.
- Filters: event type (multi-select), date range, and a customer/product search box.
- Summary strip at the top: counts per event type for the selected range.
- CSV export of the filtered view.
- Query must be indexed on `(type, created_at)` and `(user_id, created_at)`; paginate server-side, never load the whole table.

**Verification:** Trigger one real event of each type, then show the feed with all four visible, each with the correct customer, product link, and price. Click through a product link and an order link to confirm they resolve. Apply a type filter and a date filter and show the counts updating. Export CSV and paste the first three rows.

---

## TASK 16 — Admin: Newsletter subscribers

New admin sidebar item, "Newsletter".

- Table of everyone who requested the newsletter: email, name (if they have an account, otherwise blank), signup date, source (footer / modal / checkout — record this going forward), subscription status (subscribed / unsubscribed), and whether they are also a registered customer.
- Search by email, filter by status / date range / registered-vs-guest.
- Stat cards at the top: total subscribers, new this week, new this month, unsubscribe rate.
- **CSV export** of the filtered list (email, name, signup date, source) for use in an external mailing tool.
- "Copy all emails" button that copies the filtered set as a comma-separated list.
- Unsubscribe handling: an unsubscribe token + `/unsubscribe` page, and a status toggle in admin. Unsubscribed addresses must be excluded from both the export and the copy action by default — make that exclusion explicit in the UI.
- This page is admin-authenticated only. No public endpoint may ever list subscriber emails.

**Verification:** Sign up two addresses from the footer, show both in the table. Unsubscribe one via the token link and confirm the status flips and it drops out of the export. Paste the exported CSV header + rows. Confirm the endpoint 401s without an admin session.

---

## TASK 17 — Demo mode with animated mascot

Add an environment-driven demo mode for showing this build to prospective clients.

**Config:**
- `.env` flag: `APP_MODE=demo|production` (also expose as `NEXT_PUBLIC_APP_MODE` for the client). Default to `production` if unset or invalid — a missing flag must never accidentally enable demo mode.
- Demo contact details also come from env so they're easy to change: `DEMO_CONTACT_EMAIL=arnoldchrisoduor@gmail.com`, `DEMO_CONTACT_PHONE=+254791165995`.
- When `APP_MODE=production`, none of this code path runs and nothing ships to the client bundle — gate it at the component level so it tree-shakes out.

**Behaviour (demo mode only):**
1. **First visit only**, show a single welcome modal: "This is a demo store", short line explaining it's a demonstration build, and two clear actions — "Email the developer" (mailto with a prefilled subject) and "Call +254791165995" (tel: link on mobile, copy-to-clipboard on desktop). One dismiss button.
2. On dismiss, the modal **animates into a small mascot** that docks to the edge of the viewport (same pinned treatment as the stylist FAB) and stays there across pages. Persist dismissal in localStorage so the modal never shows again for that visitor.
3. The mascot idles with a subtle loop (blink, gentle bob, or breathing). On hover it reacts.
4. **Occasionally** — roughly every 90–120s, and only while the tab is visible — a speech-bubble toast emerges from the mascot with a short rotating line, e.g. "Like what you see?", "Want a store like this?", "I can be yours — tap to chat", "Built by Digital Wilderness — say hi?". The toast auto-dismisses after ~6s. Rotate through the lines without repeating consecutively.
5. Clicking the mascot or a toast opens a compact contact card with the email and phone, plus a one-line "What can I build for you?" link. Not a full modal takeover.
6. The mascot can be collapsed to a small tab by the user; collapsed state persists.
7. Respect `prefers-reduced-motion`: static mascot, toasts still appear but without motion.
8. It must never cover the back-to-top button, the stylist FAB, cart controls, or any primary CTA at any breakpoint — use the shared stacking order defined in Task 9.

**Verification:** Set `APP_MODE=demo`, hard-reload with cleared storage, and show: the welcome modal on first load only, the animate-to-mascot transition, the mascot persisting across a page navigation, at least one toast appearing, the contact card contents, and the collapse state persisting after reload. Then set `APP_MODE=production`, rebuild, and prove nothing demo-related renders **and** that no demo strings (the email, the phone, the toast copy) appear anywhere in the production JS bundle — grep the build output and paste the result. Also verify with the flag entirely absent from `.env`.

---

## Final pass (only after all 17 report PASS)

1. Run the full test suite and `go vet` / lint; paste output.
2. Build the Next.js app for production; paste output and confirm zero type errors.
3. Check every new endpoint for authorization — no analytics, activity, newsletter or admin route may be reachable unauthenticated.
4. Confirm the **public** activity endpoint leaks no surname, email, price, or ID, while the **admin** activity feed shows all of it.
5. Confirm no subscriber email is reachable outside an admin session.
6. Run Lighthouse on the homepage and a PDP; report performance and accessibility scores. Flag any regression caused by the new tracking scripts or the mascot.
7. List every migration added, in order, with the rollback command for each.