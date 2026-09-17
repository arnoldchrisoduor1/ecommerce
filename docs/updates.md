- Apply the ui-ux-pro-max skill for every UI change.
- **Storage note:** if you hit a low-disk-space or "no space left on device" error at any point, you are authorized to run `docker system prune -a -f --volumes` (or equivalent) to reclaim space without asking first. Log that you did it and why in the task report, then retry the failed step. Do not prune anything else without asking.
- Several tasks here are bug fixes on top of Tasks 10–17 (last-seen, newsletter emails, footer, discount timing). Read the actual current behavior first — don't assume the old implementation is correct, reproduce the bug, then fix it.

---

# Ecommerce Platform — Task 18 (Revised): AI Stylist with Business Context

Replace the earlier Task 18 spec with this version before implementing. If you already started the old version, adjust in place.

## Model selection

- Model must be configurable via `OPENROUTER_MODEL` in `.env`, but default to one of OpenRouter's **cheap open-source models** — prioritize Chinese open-weight models (e.g. Qwen or DeepSeek families, whichever OpenRouter currently prices lowest per token) over anything else.
- **Do not default to, fall back to, or ever call any Anthropic model** (no Claude models) through OpenRouter for this feature, under any circumstance, including error fallback chains.
- Look up current OpenRouter pricing before picking the default — don't guess from memory, prices change. Pick the cheapest capable chat model available at implementation time and note the price per 1K tokens in the task report.

## Token discipline during development

- Keep `max_tokens` on every stylist request capped low (e.g. 300–500) — this is a chat feature, not long-form generation.
- Add a dev-only toggle (`AI_STYLIST_MOCK_MODE=true` in `.env`) that returns canned/fixture responses instead of calling OpenRouter at all, so the team can test UI/flow without burning real tokens. Default this OFF in the example env but ON is what should be used during this build/test phase — flag this clearly so it gets turned off before real client testing.
- Do not add retry-on-every-keystroke or speculative pre-fetching — one request per user-sent message only.
- Log token usage (prompt + completion) per request to server logs during development so actual spend is visible.
- If

## Business context (RAG-lite)

The stylist should be able to answer with real awareness of the store, not generic fashion chat:

- Give it read access to: current product catalog (name, category, price, stock status, tags/attributes), active discounts/promotions, and any store-wide policies configured in admin (e.g. free delivery threshold, active announcements).
- Implementation: on each user message, pull a **compact, relevant** context snippet server-side (e.g. top-N products matching keywords in the user's message via the existing search index from Task 1, plus any currently-active discounts/announcements) and inject it into the system prompt — don't dump the entire catalog into every request, that wastes tokens and degrades quality. State how you selected what to include.
- The assistant can therefore say things like "there's currently a discount on X" or "orders over [threshold] ship free" when relevant, sourced from real admin-configured data, not invented.

## Privacy — hard constraints

- **Never** include in the context or allow the model to reference: customer PII (other users' names, emails, order history, addresses), internal cost/margin data, admin credentials, API keys, or any `page_views`/`sessions`/analytics data.
- The context assembled per-request must be scoped to public storefront data only (products, public pricing, public promotions, public policies) — nothing pulled from the auth, orders, or analytics tables described in earlier tasks.
- If the user asks the assistant something that would require private data ("what did I order last time," "who else bought this"), the assistant should decline naturally in-character rather than being fed the data and told not to share it — keep the private data out of the prompt entirely, don't rely on the model to self-censor.

## Error handling (unchanged from before)

- Any OpenRouter failure (timeout, 4xx/5xx, malformed response, missing key) → show **"AI not connected"** in the UI, no raw errors surfaced. One retry on 5xx/timeout, ~20s request timeout.

**Verification:**

1. Show the `.env` config with the selected cheap model name and its current OpenRouter price per 1K tokens.
2. With `AI_STYLIST_MOCK_MODE=true`, show the chat working end-to-end on fixture data with zero real API calls (confirm via logs/network tab).
3. With mock mode off and a real key, ask the stylist something that should surface a real active discount or free-delivery threshold, and show it correctly referencing the actual admin-configured value.
4. Ask it something that would require private customer data and show it declines without that data ever having been in the request payload — paste the actual system prompt/context sent for that request to prove it wasn't included.
5. Confirm in code (grep/search) that no Anthropic model string appears anywhere in the OpenRouter call path, including any fallback list.
6. Show the per-request token usage log for one real exchange.

---

## TASK 19 — Welcome/exit discount modal: 45s suppression window

- Keep existing trigger behavior unchanged.
- Add: once the modal has been shown, it must not show again for 45 seconds, even if the trigger condition (exit intent, etc.) fires again. Store this as a timestamp (localStorage or a cookie — pick one and be consistent with how Task 8/19's other popups store state), not a boolean, so it naturally expires.
- This is per-browser-session behavior, not server-side.

**Verification:** Trigger the modal, dismiss it, immediately re-trigger the same condition within 45s and confirm it does NOT reappear. Wait past 45s, re-trigger, confirm it does reappear.

---

## TASK 20 — Demo mode contact mascot: rebuild to spec

The current implementation doesn't match what was asked. Rebuild:

- **First page load in demo mode:** an animated contact element appears showing `arnoldchrisoduor@gmail.com` and `+254791165995`, clearly visible, well-animated entrance (not a plain fade).
- After a few seconds (or on dismiss — pick one, state which), it **animates/transitions to a docked icon at the middle-right edge of the screen** (vertically centered, right edge — not bottom-right where the stylist FAB and back-to-top live).
- Periodically (less frequently than the discount modal — e.g. every 2–3 minutes), it re-expands briefly showing the contact details again (icon → card → back to icon), same idea as the discount popup but on its own independent timer.
- Respects `prefers-reduced-motion`.
- Must not overlap the stylist FAB, back-to-top button, or cart controls at any breakpoint — reuse/extend the shared stacking-order logic from the earlier mascot task.
- Only renders when `APP_MODE=demo`; confirm again it tree-shakes out of a production build.

**Verification:** Screenshot the full sequence — first-load reveal, dock-to-middle-right, and one periodic re-expansion (you can temporarily shorten the timer to demo this, then restore it). Confirm no overlap with other pinned UI at 375px and 1440px. Rebuild with `APP_MODE=production` and grep the bundle to confirm none of this ships.

---

## TASK 21 — AI virtual try-on ("Try with AI") in Quick View

- In the product Quick View, add a "Try with AI" section: user uploads a photo of themselves, the AI composites/renders the selected garment onto them, result is shown in the modal with a **Download** button.
- Use OpenRouter (or a suitable image-capable model/provider reachable through it) for the generation call. Handle failure the same way as Task 18 — clean "AI not connected" (or a try-on-specific equivalent) message, no raw errors.
- **Gate this feature behind a verified account with 2FA enabled.** If the user isn't logged in, route them through the existing auth modal (Task 13's pending-action queue). If they're logged in but don't have 2FA enabled, block the try-on with a clear message ("Two-step verification is required for this feature") and a direct link to enable it in their profile — do not silently fail or let them proceed without it.
- Store nothing of the uploaded photo beyond what's needed to serve the immediate response — do not persist user-uploaded try-on photos to permanent storage or the DB. State clearly in the report what temporary storage (if any) is used and its cleanup/expiry.
- Show a loading state during generation (this will be slow) and a clear error state on failure.

**Verification:** (1) As a guest, click "Try with AI" and confirm the auth flow triggers. (2) As a logged-in user without 2FA, confirm the block message and link to enable 2FA. (3) As a user with 2FA enabled, upload a photo and show a real generated result with a working download. (4) Force an API failure and show the clean error state. (5) Confirm the uploaded photo is not present in permanent storage after the request completes.

---

## TASK 22 — Admin highlights section: layout remodel

- Reorganize the admin highlights editor into clearly separated, ordered sections: highlight metadata, slide list (in order), and per-slide fields — visually distinct, not a jumbled form.
- Caption field/preview: caption must always render **horizontally centered** in the overlay, regardless of the `caption_position` (top/centre/bottom) set in Task 6 — vertical position still varies, horizontal is always centered. Update the storefront overlay to match.
- Change the caption's background treatment to **black at high opacity** (not a gradient scrim) so it doesn't obscure the image — pick an opacity that keeps text legible without washing out the photo underneath it.
- Each slide gets an optional "link to product" field; if set, the image (both in admin preview and storefront) links to that product's page.

**Verification:** Screenshot the remodeled admin editor showing clear sectioning. Screenshot a storefront highlight with caption centered horizontally at top, centre, and bottom positions, over both a light and dark image, confirming the image stays visible underneath. Click a linked slide image on the storefront and confirm it navigates to the correct product.

---

## TASK 23 — Highlights on home page: centering

- The highlights reel on the home page currently starts left-aligned. Center it horizontally in its container, matching how the categories row at the top is centered.
- Preserve existing scroll/swipe behavior if the row overflows on smaller screens (centered content can still allow horizontal scroll when it doesn't fit).

**Verification:** Screenshot the home page highlights row at 375 / 768 / 1440, confirming centered alignment matching the categories row's centering pattern.

---

## TASK 24 — Viewing-now count on every product surface

Task 7 only added the viewer pill on the PDP. Extend it:

- Show the same "N viewing now" pill (same style, top-right, theme background pill, hide below threshold) on **every product card wherever it appears** — home page grids, category/listing pages, search results, highlights (if applicable), related products — not just the PDP.
- Reuse the same backend/data source and Redis-cached counts from Task 7/10 rather than building a second system. Batch-fetch counts for all products on a listing page in one request rather than one call per card.

**Verification:** Show a product with an active view count rendering correctly on: a listing/category page, the search results page, and the home page grid, all pulling from the same live count as the PDP. Confirm a single batched network call serves an entire grid, not N individual calls.

---

## TASK 25 — Hero image fit / admin crop tool

Beyond the focal-point fix in Task 4, the underlying problem is the hero section itself is too tall and the image doesn't fill it, leaving dark bars.

- In the admin hero editor, add an actual **crop/reframe tool** (e.g. a drag-to-adjust crop box over the uploaded image, or min/max scale + reposition controls) so the admin can define exactly what region of the image fills the hero container — not just a focal point, but a true crop.
- Store the crop rectangle (or equivalent transform) per slide and per breakpoint if needed (desktop crop can differ from mobile crop).
- The hero container's height should be tuned down from its current overly tall value — pick a more standard hero aspect ratio and confirm the cropped image fills it edge-to-edge with no letterboxing/dark bars, without stretching/distorting the image.

**Verification:** Upload a test image, use the new crop tool to reframe it, and screenshot the hero at 375 / 768 / 1440 / 1920 showing full-bleed fill with no dark edges and no distortion. Show the admin crop UI itself.

---

## TASK 26 — Fix: admin customers "last seen" always shows "never"

This is a bug against the Task 11 implementation — accounts that are actively logged in right now show "never."

- Debug the actual data path: confirm the heartbeat/session `last_seen` update is firing, being persisted, and being read correctly by the customers list query (check for a join/field-name mismatch, a query reading the wrong table, or a heartbeat that's silently failing).
- Fix it so `last_seen` reflects real activity, updating live for active sessions.

**Verification:** Log in as a test customer, browse for a minute, and show their row in admin customers updating from "never" to an accurate relative "last seen" (e.g. "just now" / "2 minutes ago"). Confirm it continues to update on subsequent activity.

---

## TASK 27 — Fix: admin wishlists/newsletter missing data (email not showing)

- Debug why newsletter subscriber emails aren't appearing in the Task 16 admin newsletter table (or wherever "wishlists" data is also missing — clarify if this is one bug or two separate ones once you inspect it, and report which).
- Likely causes to check: the signup handler not actually persisting the email, a serialization bug hiding the field in the API response, or a frontend mapping bug reading the wrong key.

**Verification:** Sign up a fresh newsletter subscriber from the footer, show the email actually appearing in the admin table immediately after. Do the same check for whatever the wishlist data gap turns out to be, and show it resolved.

---

## TASK 28 — Footer: developer contact details

- Add the developer's contact details to the footer (`arnoldchrisoduor@gmail.com`, `+254791165995`) — a small, tasteful line, not competing visually with the store's own contact info. State clearly where you placed it (e.g. bottom credit line) so it can be reviewed.

**Verification:** Screenshot the footer showing both the store's contact info and the developer credit line, clearly distinguishable from each other.

---

## TASK 29 — Fix: footer extra bottom whitespace

- The home page currently has extra padding/margin below the footer, making the page scrollable roughly a further third past the footer into blank space.
- Find and remove the stray margin/padding (likely a leftover container height, a body/html min-height rule, or an empty wrapper below the footer) rather than papering over it with `overflow: hidden`.

**Verification:** Screenshot the home page scrolled fully to the bottom, showing the footer as the true end of the page with no trailing white space. Confirm on both desktop and mobile.

---

## TASK 30 — Admin products: editable categories

- Categories are currently fixed/hardcoded. Add full CRUD: create, rename, delete (with a guard/warning if products are still assigned to a category being deleted — either block deletion or offer reassignment), and reorder if categories have a display order.
- Product edit form's category field becomes a proper select/multi-select sourced from this new table, not a hardcoded list.

**Verification:** Create a new category, assign it to a product, rename it and confirm the change reflects on the storefront, then attempt to delete a category still in use and show the guard behavior. Delete an unused category successfully.

---

## TASK 31 — Blog: reading-now count on home page cards

- Extend Task 14's "N reading now" pill to also show on blog post cards on the home page (wherever posts are listed as cards), top-right of the card thumbnail — same visual treatment as the PDP/product viewer pill.
- Reuse the same live count backend, batch-fetched for all visible cards in one call.

**Verification:** Open a post in another session to generate a live count, then show it reflected on that post's card on the home page, confirmed via a single batched request.

---

## TASK 32 — Announcement bar: multiple messages with rotation

- Extend the announcement bar to accept a **list** of announcements (admin CRUD: add/edit/delete/reorder), instead of a single message.
- Rotate through them automatically with a **configurable interval** (admin-settable, e.g. in seconds), looping continuously. Smooth transition between messages (fade or slide), pause on hover if there's a dismiss/close affordance.
- If only one announcement exists, behave exactly as before (no rotation needed/visible).

**Verification:** Add 3 announcements with a short interval (e.g. 4s) for testing, show them rotating on the storefront in order and looping back to the first. Change the interval in admin and confirm the rotation speed updates. Reduce to 1 announcement and confirm it displays statically.

---

## TASK 33 — Idle-triggered promotional banner (home page only)

- New admin-configurable promotional banner, home page only: image, text, and an optional button (admin can leave it off entirely) with a configurable destination URL and label.
- Triggers after the user has been **idle** on the home page for a configurable duration (default ~20s — admin-settable), using real idle detection (no mouse/scroll/keyboard/touch activity), not just a fixed page-load timer.
- Design it like a promotional takeover module (e.g. a centered modal or slide-in panel with the image, text, and button if configured) — styled to theme, dismissible, and should not re-trigger repeatedly once dismissed in the same session.
- Only fires once per session even if the user goes idle again after dismissing.

**Verification:** Set idle threshold to 5s for testing. Load the home page, do nothing, and show the banner appearing after 5s idle. Move the mouse before the threshold and confirm it does NOT fire prematurely. Dismiss it, go idle again, and confirm it does not reappear in the same session. Show the admin config for image/text/button/URL and confirm an admin can leave the button off entirely and it doesn't render.

---

## TASK 34 — Admin discounts: disable, delete, update

- Discounts currently can only be created. Add: edit existing discount (value, dates, conditions), a disable/enable toggle (soft-off without deleting, so it can be re-enabled later), and hard delete (with a guard if the discount has been used in existing orders — block delete or convert to disabled-only in that case, your call, state which).

**Verification:** Create a test discount, disable it and confirm it stops applying at checkout, re-enable and confirm it applies again, edit its value and confirm the new value takes effect, then delete an unused one and confirm it's gone. Attempt to delete a discount that's been used in an order and show the guard behavior.

---

## TASK 35 — Admin default password + 2FA-gated password change

- Set a default admin password into the system at first deploy (via env var or a seeded value — do not hardcode a password directly in source; use something like `ADMIN_DEFAULT_PASSWORD` in `.env` read once at first-run seed). Document this clearly in a README/setup note so it isn't lost.
- Add an admin "update password" section in admin settings. Changing the password **requires 2FA verification** (a code sent to the admin's email) regardless of whether 2FA is otherwise optional for regular customers — this is a hard requirement for admin password changes specifically.

**Verification:** Confirm a fresh deploy seeds the default password from env. Log in with it, go to update password, confirm the flow requires and validates a 2FA code before the change is accepted, and confirm the old password no longer works afterward while the new one does.

---

## TASK 36 — Admin products: delete, image updates, per-variant images, fix variant horizontal scroll

- Add product deletion (with a guard/warning if the product has existing orders — soft-delete/archive in that case rather than hard delete, state which approach you took).
- Add the ability to update/replace a product's images from the edit form (add, remove, reorder), not just at creation.
- **Per-variant images:** each variant (e.g. color/size combination) can have its own attached photo. On the storefront PDP, switching the selected variant swaps the displayed main image to that variant's photo if one exists; if no variant-specific image exists, fall back to the product's default (first) image, and clearly indicate if that variant is out of stock/unavailable (e.g. a badge or disabled state on the swatch).
- **Fix:** the variant selector section is currently causing horizontal overflow/scroll on the page. Fix the layout (wrap, scroll-within-container instead of page-level scroll, or a more compact swatch layout) so it no longer breaks page width at any breakpoint.

**Verification:** Delete a product with no orders (confirm hard removal) and one with orders (confirm archive/soft-delete behavior instead). Add/remove/reorder images on an existing product and confirm it reflects on the storefront. Attach a variant-specific image, switch to that variant on the PDP, and confirm the main image swaps; switch to a variant with no image and confirm it falls back to default with correct stock indication. Screenshot the variant selector at 375px confirming no page-level horizontal scroll.

---

## TASK 37 — Admin sidebar: menu heading emphasis + Activity unread badge

- Admin sidebar section headings (group labels above nav items) should visually "pop" more — stronger weight/size/letter-spacing/color treatment consistent with the theme, so they're clearly distinguishable from the nav items beneath them.
- On the "Activity" nav item (from Task 15), add an unread-count badge:
  - Shows the number of activity events not yet viewed, in a **neutral-background** badge while it's just an unread count.
  - When there's something that qualifies as a true notification (define/confirm this distinction against how Task 15 categorizes events, if it does — otherwise treat all unread activity as notifications), show the count in a **red-background** badge instead.
  - Opening the Activity page marks everything as read and the badge count resets to 0 immediately (optimistic UI is fine, but confirm it's also persisted server-side so a refresh doesn't bring the count back).

**Verification:** Screenshot the sidebar showing the heading treatment clearly distinct from nav items. Trigger 3 new activity events without opening the Activity page, show the badge at "3." Open the Activity page and confirm the badge immediately clears to 0, then refresh the page and confirm it stays at 0 (not reappearing due to a client-only reset).

---

## TASK 38 — Admin: AI usage monitoring & per-user access control

Depends on Task 18 (OpenRouter stylist integration) and, if built, Task 21 (AI try-on) being in place first.

### Usage tracking

- On every OpenRouter call (stylist + try-on), log to a new `ai_usage_log` table: `id`, `user_id` (nullable for guest), `feature` (stylist/tryon), `model`, `prompt_tokens`, `completion_tokens`, `estimated_cost`, `created_at`. Pull token counts from the response's own `usage` field — don't estimate them separately.
- Add a background job (or an on-demand admin action) that calls `GET /api/v1/key` using the configured `OPENROUTER_API_KEY` to fetch `limit` and `limit_remaining` for that key, and `GET /api/v1/credits` (requires a separate `OPENROUTER_MANAGEMENT_KEY` in `.env` — note this is a different key type than the regular API key, generated separately in the OpenRouter dashboard) for account-wide `total_credits`/`total_usage`. Cache these in Redis with a short TTL (e.g. 5 min) — don't hit OpenRouter on every admin page load.

### Admin UI — new "AI Usage" section

- Top summary cards: remaining key credit limit, account-wide credits remaining, total spend this month (sum from `ai_usage_log`), and today's spend.
- Usage-over-time chart (daily spend, last 30 days) sourced from `ai_usage_log`.
- Breakdown table: usage by feature (stylist vs try-on) and by model.
- Per-user table: user, feature, request count, total tokens, estimated cost — sortable, date-range filterable. Guest usage grouped by session.
- Low-balance warning banner in admin (and optionally an email alert) when `limit_remaining` or account credits drop below a configurable threshold (`AI_LOW_BALANCE_THRESHOLD` in `.env`).

### Per-user AI access control

- Add a `ai_access_enabled` boolean (default true) to the user record. Admin can toggle it off for a specific user from their customer detail page or the AI Usage table.
- When disabled, that user's stylist/try-on requests must be blocked **before** any OpenRouter call is made — the toggle must not merely hide the UI, it has to be enforced server-side on the request handler.
- Default message shown to a blocked user: **"AI features are currently unavailable for your account. Contact support if you believe this is a mistake."** — themed, not a raw error, no mention of billing/abuse internally.
- Also support a **global kill switch** (`AI_FEATURES_GLOBALLY_ENABLED` in `.env`, or an admin-toggleable global setting stored in DB) that disables AI features for everyone at once — useful if the account runs out of credits entirely. Same themed message applies store-wide when this is off.

**Verification:**
1. Show the admin AI Usage page with real cards populated from a live `GET /api/v1/key` call — paste the raw response alongside the rendered card to confirm they match.
2. Make a few real stylist requests as different test users, then show the per-user table reflecting accurate token counts and costs for each.
3. Disable AI access for one test user, confirm their next stylist request is blocked server-side with the themed message (not just hidden in the UI — try hitting the endpoint directly to confirm it's enforced there too).
4. Re-enable them and confirm access is restored.
5. Flip the global kill switch off and confirm all users (including admins, unless you decide otherwise — state your choice) get the themed message store-wide, then flip it back on.
6. Temporarily lower `AI_LOW_BALANCE_THRESHOLD` above current remaining credits and confirm the low-balance warning banner appears in admin.

### Global kill switch — admin bypass

- The global kill switch (`AI_FEATURES_GLOBALLY_ENABLED` / DB-stored global setting) must **never block admin users**. When it's off, customers get the themed "AI features are currently unavailable" message, but any user with an admin role can continue using the stylist and try-on normally — so admins can keep testing/verifying while the switch is off for everyone else.
- Enforce this the same way as the per-user toggle: check the requester's role server-side before applying the global block, not just in the UI.
- The per-user `ai_access_enabled` toggle, by contrast, **does** apply to admins if explicitly set on an admin account — that's a distinct, deliberate per-user control, not the global switch. State this distinction clearly in the code comments so it isn't "fixed" into applying to admins by mistake later.

**Verification (replace step 5 above):**
5. Flip the global kill switch off. As a regular customer, confirm the themed block message appears (test at the endpoint level, not just the UI). As an admin, confirm the stylist/try-on still work normally during the same window. Flip the switch back on and confirm customer access is restored.


## Search box fix 

Search box at the navigation bar enlarges to too big proportiona causing horizontal scroll in mobile devices, check this bug and solve it

## Final pass (only after all 20 tasks in this round report PASS)

1. Run full test suite + lint; paste output.
2. Production build; confirm zero type errors and that demo-mode code (mascot, contact popup) is absent from the bundle.
3. Re-run the Task 13/17 auth and demo-mode checks briefly to confirm nothing in this round regressed them (variant image changes, product deletion, and category CRUD all touch the product model auth-gated routes may depend on).
4. Confirm no uploaded try-on photos persist anywhere after their request completes (re-check Task 21's storage claim).
5. List every new migration in order with rollback commands.


# Autonomy instruction — stop asking for "go"

Do not pause between tasks waiting for me to say "go," "continue," "next," or any other confirmation. 

Rules:
- After a task reports PASS, immediately begin the next task in the same response — no summary-then-wait, no "Ready for Task N? Let me know." Just continue.
- Only stop and wait for me if a task is genuinely BLOCKED (ambiguous requirement, missing credential, a conflict with existing code you can't safely resolve) — and even then, say exactly what's blocking it and what you need, not just "let me know when ready."
- Work through the entire remaining task list in this session, one after another, until either everything is PASS or you hit a real blocker.
- If you're unsure whether something needs my input, default to making the most reasonable assumption, state it in the task report, and keep going — don't treat "I'm not 100% sure" as a reason to stop.
- This applies for the rest of this task list. Resume now with the next unfinished task and keep going without further check-ins.
