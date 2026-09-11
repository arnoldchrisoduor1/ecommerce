# Design brief — ecommerce platform

For use with the `ui-ux-pro-max` Claude Code skill. This defines the
visual identity and interaction feel; it does NOT define page structure
or feature scope — see `docs/ecommerce-feature-list.md` for that, and
the four wireframes already built (landing, PDP, cart/checkout, admin)
for layout reference.

## Context

- Single-brand fashion storefront: women's basics (tees, tanks,
  bodysuits, knitwear) plus curated bundles.
- Market: Kenya, Nairobi-based, mobile-heavy traffic expected — design
  mobile-first, not desktop-first-then-shrink.
- Client priority (explicitly stated): the experience should feel
  **precise and extremely well made** — polish and attention to detail
  matter as much as feature completeness. This is the single biggest
  differentiator the client is chasing.

## Aesthetic direction

- Clean, minimal, confident — lots of white space, restrained color
  palette, typography doing most of the visual work.
- Product photography is the hero everywhere; UI chrome should recede,
  never compete with the product images.
- Micro-interactions should feel tight and deliberate: fast transitions
  (150–250ms), subtle easing, no bouncy or playful motion — precision
  over personality.
- Avoid generic ecommerce-template feel: no default Bootstrap-card
  aesthetics, no stock rounded-corners-and-drop-shadow-everywhere look.
- Reference feel (aesthetic quality only — do not copy any actual
  layout, code, copy, or imagery): a well-executed, editorial-feeling
  fashion storefront with a precise, curated, slightly luxury-adjacent
  tone despite accessible pricing.

## Typography

- One confident display/heading typeface (can be a distinctive sans or
  a refined serif for headlines) + one clean workhorse sans for body/UI
  text. Avoid using more than 2 typefaces total.
- Generous letter-spacing on all-caps labels (nav, category tags,
  badges) — this is a strong lever for the "precise" feel.
- Clear, consistent type scale — avoid ad-hoc font sizes per component.

## Color

- Neutral-dominant palette (near-black, off-white, warm or cool grey —
  pick one direction and stay consistent) as the base.
- One accent color used sparingly and consistently for CTAs, sale
  tags, and the live-viewer/urgency indicators — not scattered across
  multiple competing accent colors.
- Sale/discount states, stock warnings, and success states need their
  own restrained semantic colors that don't clash with the accent.

## Components requiring special attention

These map directly to the urgency/social-proof features in the spec —
get these right, since they're highly visible and easy to make feel
cheap or spammy if over-designed:

- **Live viewer count badge** (PDP + grid) — should read as a quiet
  data point, not a flashing alert. Small, understated, no animation
  loops that draw the eye away from the product.
- **Exit-intent modal** — should feel like an intentional, well-timed
  offer, not a popup ad. Generous padding, clear hierarchy (offer →
  code → claim counter), one obvious dismiss action.
- **Highlights reel** — smooth horizontal scroll, consistent circular
  avatar sizing, clear active/viewed state distinction.
- **Recent purchase ticker** — should feel ambient, not intrusive.
  Corner toast, auto-dismissing, low visual weight.
- **Admin dashboard** — different register from the storefront: denser,
  data-forward, less precious about white space, but still consistent
  in typography/color with the storefront so it doesn't feel like a
  different product.

## What NOT to do

- Don't introduce a third typeface "for personality."
- Don't use more than one accent color for interactive elements.
- Don't add decorative illustration or iconography that isn't
  functional — every visual element should earn its place.
- Don't let the admin dashboard use a completely different design
  system than the storefront (shared tokens, different density).

## Deliverable expectation

Apply this brief via the ui-ux-pro-max skill to establish: typography
scale, color tokens, spacing/grid system, and component styling
(buttons, badges, modals, cards). Once the design system is
established, build actual Next.js components against the wireframed
layouts — don't finalize the design system and the components in the
same pass; establish tokens first, get sign-off, then build.