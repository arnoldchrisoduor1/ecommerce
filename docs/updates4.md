# Ecommerce Platform — Round 4: Viewer Threshold, Chat UX, Cart Fix, Sales Docs

Same conventions as before: one task at a time, PASS report format, docker prune allowed on low-storage errors.

---

## TASK 39 — Fix: viewer count should show even at 1 viewer

- Currently hidden below 2 viewers. Change so it shows starting at **1** — "1 viewing now" is valid and should render, not just 2+.
- Applies everywhere the pill was added: PDP, listing/category cards, search results, home grid (Task 7/24).

**Verification:** View a product alone (confirm no other active sessions on it) and show "1 viewing now" rendering correctly on both the PDP and a listing card.

---

## TASK 40 — AI stylist: session memory, image-illustrated suggestions, expandable modal

### Session context

- The stylist must retain conversation context for the entire session — currently each message appears to be treated independently. Maintain the message history (both user and assistant turns) and include prior turns in each new request to OpenRouter, up to a reasonable context window budget (truncate/summarize the oldest turns if the conversation gets long, rather than silently dropping context or blowing past the model's limit).
- Persist the session's message history client-side (or server-side keyed to session/user) so a page refresh doesn't lose the conversation mid-session — your call on storage mechanism, state which you used.

### Image-illustrated suggestions

- When the assistant recommends a specific product, the response should render that product as a small card (thumbnail, name, price) inline in the chat, not just plain text — clickable through to the product page.
- This means the assistant's response needs to be structured (e.g. have it return a product reference/ID alongside its text, via a lightweight structured output convention) rather than just free text, so the frontend can look up and render the real product data rather than guessing from text. Reuse the same "relevant context injection" approach from Task 18 to ground these suggestions in real catalog data — don't let the model invent products that don't exist.

### Expandable modal

- Add an expand control on the chat modal. Expanded state: significantly larger, centered on screen (not docked to a corner), giving room to read longer conversations and see product suggestion cards clearly. Collapse control returns to the normal docked chat widget.
- Preserve scroll position and full message history across expand/collapse — it's a resize, not a reset.
- Responsive: on mobile, "expanded" can reasonably mean near-fullscreen.

**Verification:** Have a multi-turn conversation, refresh the page, and confirm the history persists. Ask for a product recommendation and confirm it renders as a real clickable product card sourced from actual catalog data (test that it never fabricates a nonexistent product — try a request for something not in stock and see how it handles it). Expand the modal mid-conversation and confirm history/scroll position is preserved, then collapse and confirm it returns to normal.

---

## TASK 41 — Fix: cart cannot fully remove an item

- Currently the quantity stepper floors at 1 — there's no way to remove an item entirely.
- Add an explicit **Remove** action per cart line item (a trash icon or "Remove" text link, separate from the quantity stepper), that deletes the line entirely regardless of quantity.
- Decrementing quantity to 0 via the stepper should also either remove the item or prompt for removal (pick one, state which) — don't leave a dead-end where 1 is an artificial floor with no way past it.
- Update cart totals/count immediately on removal, both in the cart drawer/page and any cart icon badge elsewhere in the header.

**Verification:** Add an item, increase quantity to 3, then use the new Remove action and confirm it's fully gone from the cart (not just decremented), with totals and the header cart badge updating correctly. Also test decrementing an item with quantity 1 via the stepper and confirm the resulting behavior matches whichever approach you implemented.

---

## TASK 42 — Demo-only "Features" page for sales purposes

New page, footer-linked, labeled **"Features"** — gated behind the same `APP_MODE=demo` flag as the developer contact popup (Task 17/20), so it never ships in a real client's production build.

Apply the ui-ux-pro-max skill and design this properly — it's a sales artifact, not a changelog. Treat it like a product marketing page: clear sections, visual hierarchy, icons or small illustrative mockups per feature group, not a dense bullet dump.

### Content — Customer-facing features
Cover, grouped into clear sections with short benefit-oriented descriptions (not just a feature name):
- Product search, browsing, filtering
- Live "viewing now" social proof on products and blog posts
- Wishlist, cart, and streamlined checkout
- AI stylist chat with contextual, catalog-aware recommendations
- AI virtual try-on
- Instagram-style multi-image highlights with captions
- Real-time social proof activity ticker
- Blog/style content with reading stats
- Optional two-step verification for account security
- Newsletter signup
- Fully responsive, modern design system

### Content — Admin/business-owner features
Same treatment, covering:
- Full product management (categories, variants, per-variant imagery, stock status)
- Order and customer management with live "last seen"/online presence tracking
- Analytics: most-viewed products, page traffic, active-user counts across multiple time windows, per-user view detail
- Blog read analytics
- Discount/promotion management (create, edit, disable, schedule)
- Configurable announcement bar and idle-triggered promotional banners
- Activity feed with unread notifications
- Newsletter subscriber management with export for marketing campaigns
- AI usage monitoring and per-user/global AI access controls
- Role-based admin access with 2FA-protected sensitive actions (password changes)

### Layout suggestions
- Hero/intro section framing this as "everything included in this platform."
- Two clearly separated sections or tabs: Customer Experience vs. Business/Admin Tools.
- Consider a simple icon + heading + 1-2 line description card grid per feature — scannable, not a wall of text.
- A closing CTA section inviting contact for customization (can reuse the same developer contact details, styled as a proper section here rather than the popup).

**Verification:** Screenshot the full page at 375 / 768 / 1440, confirming it's genuinely well-designed (proper spacing, icon usage, visual grouping) rather than a plain list. Confirm the footer link to it only appears when `APP_MODE=demo`, and confirm the page itself 404s or redirects when `APP_MODE=production`. Rebuild in production mode and confirm the page and its footer link are both absent from the bundle.

---

## TASK 43 — Developer contact popup: clarify this is a demo

Update the Task 17/20 popup content — same animation/behavior, just revise the copy:

- Add a clear line **above** the contact details stating this is a demo build — something like: "This is a demo storefront showcasing available features. A real deployment would not include this notice." (feel free to refine the exact wording, but the meaning must be explicit: the visitor should understand this popup itself is demo-only scaffolding, not something every client site ships with).
- Keep the existing contact details (email/phone) and animation/docking/periodic-reappearance behavior from Task 20 unchanged — this is a copy update, not a redesign.

**Verification:** Screenshot the popup showing the new "this is a demo" framing clearly above the contact details, in both the first-load expanded state and the periodic re-expansion state.

## TASK 44 — Admin: fix horizontal scroll on every page (mobile responsiveness audit)

Every admin page currently overflows horizontally on mobile — this needs a full audit, not a single spot-fix, since it's happening across the entire admin section.

### Investigate root cause first

Before patching individual pages, check for a shared cause likely affecting all of them:
- Is the admin layout shell (sidebar + content wrapper) using a fixed width, a `min-width` on the content area, or missing `overflow-x: hidden`/`max-width: 100%` at the container level?
- Are tables the main culprit (wide data tables with many columns not wrapped in a scrollable container of their own, so the whole page scrolls instead of just the table)?
- Is the sidebar itself pushing page width when it should collapse/overlay on mobile instead of sitting inline?

Fix the shared layout issue first, then re-check whether individual pages still overflow.

### Per-page pass

Go through every admin menu item individually — Overview/Dashboard, Products, Categories (Task 30), Orders, Customers, Discounts, Highlights (Task 22), Blog, Activity (Task 15), Newsletter (Task 16), AI Usage (Task 38), Settings/Password (Task 35), and any others in the sidebar — and for each:

- Confirm no page-level horizontal scroll at 375px width.
- Wide tables get their own `overflow-x: auto` **inside** a bounded container, so only the table scrolls horizontally if it must, never the whole page. Prefer a responsive table pattern (stacked/card view on mobile, or hide less-critical columns below a breakpoint) where practical over relying on inner scroll alone.
- Forms, modals, and the variant selector fix from Task 36 specifically — re-verify that one didn't regress.
- Buttons/action groups wrap instead of forcing width.
- Charts (Task 11, 38) resize to container width rather than rendering at a fixed pixel width.

### Verification method

Test every single admin page at 375px width (iPhone SE-class, the tightest common breakpoint) and confirm the page itself never scrolls sideways — only intentionally-scrollable inner elements (like a wide table) may, and only if a card/stacked alternative genuinely isn't practical for that data.

**Verification:** Provide a screenshot of every admin page listed above at 375px, each showing no page-level horizontal scroll. For any page where an inner element (e.g. a table) still scrolls horizontally by design, note which one, why a stacked/responsive alternative wasn't used, and confirm it's contained (doesn't drag the page width with it).