# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/ecommerce-storefront/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.
>
> Source brief: `docs/DESIGN_BRIEF.md`
> Generated via ui-ux-pro-max (`--design-system`, variance 2, motion 2, density 4)
> then refined to match the brief exactly.

---

**Project:** Ecommerce Storefront  
**Category:** Women's fashion basics (Kenya / Nairobi, mobile-first)  
**Style:** Minimalism & Swiss Style — editorial, precise, luxury-adjacent  
**Design Dials:** Variance 2/10 | Motion 2/10 | Density 4/10 (storefront)

---

## Positioning (from brief)

- Feel **precise and extremely well made** — polish over personality.
- Product photography is the hero; UI chrome recedes.
- Mobile-first. Lots of white space. Typography does most of the visual work.
- Micro-interactions: **150–250ms**, subtle easing, **no bounce / no playful motion**.

## Anti-patterns (do not ship)

- Third typeface “for personality”
- Multiple competing accent colors
- Decorative illustration / non-functional iconography
- Bootstrap-card look (heavy radius + drop shadows everywhere)
- Cream + terracotta + display-serif AI cluster (brief + project bias rules)
- Purple / indigo gradient themes
- Broadsheet / dense newspaper layout
- Flashing live-viewer badges or spammy exit-intent popups
- Admin as a separate design system (shared tokens only; density differs)

---

## 1. Typography (2 typefaces max)

| Role | Family | Why |
|------|--------|-----|
| **Display / headings** | **Cormorant** via `--font-family-display` | Refined serif — fashion / editorial (ui-ux-pro-max Luxury Serif pairing) |
| **Body / UI** | **Montserrat** via `--font-family-body` | Clean geometric sans — labels, nav, buttons, admin data |

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@400;500;600;700&display=swap
```

### Type scale tokens

| Token | Size | Line-height | Weight | Tracking | Use |
|-------|------|-------------|--------|----------|-----|
| `--font-display-xl` | `2.75rem` / 44px | `1.1` | 500 | `-0.02em` | Hero / campaign titles |
| `--font-display-lg` | `2.25rem` / 36px | `1.15` | 500 | `-0.02em` | Page titles |
| `--font-display-md` | `1.75rem` / 28px | `1.2` | 500 | `-0.015em` | Section titles |
| `--font-display-sm` | `1.375rem` / 22px | `1.25` | 500 | `-0.01em` | Card / PDP product name |
| `--font-body-lg` | `1.125rem` / 18px | `1.6` | 400 | `0` | Lead / intro copy |
| `--font-body` | `1rem` / 16px | `1.55` | 400 | `0` | Default body |
| `--font-body-sm` | `0.875rem` / 14px | `1.5` | 400 | `0` | Secondary copy, table cells |
| `--font-label` | `0.75rem` / 12px | `1.3` | 500 | `0.12em` | All-caps nav, category tags, badges |
| `--font-caption` | `0.6875rem` / 11px | `1.4` | 500 | `0.08em` | Meta, timestamps, live-viewer |

**Rules**
- Display → Cormorant only. Body/UI → Montserrat only.
- All-caps labels **must** use `--font-label` + generous tracking (brief: strong lever for “precise”).
- Never invent ad-hoc sizes in components — map to this scale.
- Minimum body size: 16px on storefront; admin may use `--font-body-sm` for dense tables.

---

## 2. Color tokens

**Direction:** Cool-neutral base (not warm cream) + one restrained gold accent.  
Aligned with ui-ux-pro-max “E-commerce Luxury / Premium dark + gold”, shifted off warm-cream to avoid the terracotta/cream template cluster.

### Neutrals

| Token | Hex | Role |
|-------|-----|------|
| `--color-bg` | `#FFFFFF` | Page background |
| `--color-bg-subtle` | `#F4F4F5` | Alternating sections, admin canvas |
| `--color-fg` | `#0A0A0A` | Primary text |
| `--color-fg-muted` | `#52525B` | Secondary text |
| `--color-fg-subtle` | `#71717A` | Tertiary / meta |
| `--color-border` | `#E4E4E7` | Hairline borders, dividers |
| `--color-border-strong` | `#A1A1AA` | Emphasized rules |
| `--color-surface` | `#FFFFFF` | Cards / elevated panels |
| `--color-scrim` | `rgba(10, 10, 10, 0.45)` | Modal overlay |

### Brand / interactive (single accent)

| Token | Hex | Role |
|-------|-----|------|
| `--color-primary` | `#0A0A0A` | Primary CTA fill (near-black Swiss) |
| `--color-on-primary` | `#FFFFFF` | Text on primary |
| `--color-accent` | `#A16207` | **Only** accent — sale tags, live-viewer, secondary CTAs, focus ring optional |
| `--color-on-accent` | `#FFFFFF` | Text on accent |
| `--color-accent-muted` | `#FEF3C7` | Soft accent wash (exit-intent highlight, claim counter bg) |

### Semantic (restrained; do not compete with accent)

| Token | Hex | Role |
|-------|-----|------|
| `--color-sale` | `#A16207` | Sale price / discount label (same as accent per brief) |
| `--color-stock-ok` | `#3F6212` | In stock |
| `--color-stock-low` | `#B45309` | Low stock warning |
| `--color-stock-out` | `#71717A` | Sold out (muted, not alarm) |
| `--color-success` | `#3F6212` | Success / paid / confirmed |
| `--color-danger` | `#B91C1C` | Errors, destructive actions |
| `--color-on-danger` | `#FFFFFF` | Text on danger |

**Rules**
- One accent only for interactive emphasis (`--color-accent`).
- Stock / success / danger stay muted earth/greens/reds — never neon.
- Live viewer badge: accent text on transparent or `--color-accent-muted`, **no pulse animation**.

---

## 3. Spacing & grid

Base unit: **4px**. Storefront uses the spacious end of the scale.

| Token | Value | Typical use |
|-------|-------|-------------|
| `--space-1` | `4px` | Icon gaps |
| `--space-2` | `8px` | Inline gaps |
| `--space-3` | `12px` | Compact padding |
| `--space-4` | `16px` | Default component padding |
| `--space-5` | `20px` | — |
| `--space-6` | `24px` | Card padding, form gaps |
| `--space-8` | `32px` | Section internal |
| `--space-10` | `40px` | — |
| `--space-12` | `48px` | Between content blocks |
| `--space-16` | `64px` | Section vertical rhythm |
| `--space-20` | `80px` | Major section breaks |
| `--space-24` | `96px` | Hero vertical (desktop) |

### Layout grid

| Token | Value |
|-------|-------|
| `--grid-columns` | `12` |
| `--grid-gutter` | `16px` (mobile) / `24px` (≥768px) |
| `--grid-margin` | `16px` (mobile) / `24px` (tablet) / `auto` (desktop) |
| `--container-max` | `1280px` |
| `--container-narrow` | `720px` (checkout, blog article) |
| `--admin-sidebar` | `240px` |

Breakpoints: `375` · `768` · `1024` · `1440` (mobile-first).

---

## 4. Radii, borders, elevation, motion

| Token | Value | Notes |
|-------|-------|-------|
| `--radius-none` | `0` | Default for cards / images (Swiss) |
| `--radius-sm` | `2px` | Inputs, small controls |
| `--radius-md` | `4px` | Buttons, badges (minimal only) |
| `--radius-full` | `9999px` | Highlights reel avatars **only** |
| `--border-width` | `1px` | Hairline |
| `--shadow-none` | `none` | Default — prefer borders over shadows |
| `--shadow-modal` | `0 16px 48px rgba(10,10,10,0.12)` | Modal panel only |
| `--duration-fast` | `150ms` | Hover / press |
| `--duration-base` | `200ms` | Default transitions |
| `--duration-slow` | `250ms` | Modal enter / drawer |
| `--ease-out` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Precise, no bounce |
| `--focus-ring` | `0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)` | Visible keyboard focus |

`prefers-reduced-motion: reduce` → durations → `0.01ms`.

---

## 5. Base components (shared tokens)

See `tokens.css` + `components.css` for implementable styles.

| Component | Storefront | Admin (density override) |
|-----------|------------|--------------------------|
| **Button** | Tall touch targets (44px), letter-spaced labels optional | Shorter (32–36px), same colors |
| **Badge** | `--font-label`, accent / semantic fills, nowrap | Same tokens, tighter padding |
| **Modal** | Generous padding (`--space-8`), one dismiss, scrim | Same chrome; content denser |
| **Card** | No shadow, hairline or none; photo-first | Border + compact padding; data-first |
| **Live viewer** | Quiet caption + accent dot; no loop animation | N/A / quieter still |

---

## 6. Iconography

- Phosphor (`@phosphor-icons/react`) outline, consistent stroke.
- No emoji as UI icons.
- Sizes: `--icon-sm` 16 · `--icon-md` 20 · `--icon-lg` 24.

---

## File map

| File | Purpose |
|------|---------|
| `MASTER.md` | This document — source of truth |
| `tokens.css` | CSS custom properties |
| `components.css` | Base button / badge / modal / card (+ admin density) |
| `pages/admin.md` | Density & layout overrides only (shared colors/type) |

**Stop here for review.** Do not build landing / PDP / cart / admin screens until tokens are approved.
