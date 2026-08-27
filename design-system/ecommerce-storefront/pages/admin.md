# Admin dashboard — page override

> Overrides `MASTER.md` **density and layout only**.  
> Colors, typefaces, accent, radii, motion, and focus rings stay shared.

**Density dial:** 8/10 (dense / data-forward)  
**Brief:** “different register… denser… less precious about white space, but still consistent in typography/color”

---

## Spacing overrides

Use the same `--space-*` tokens with tighter component recipes:

| Context | Storefront | Admin |
|---------|------------|-------|
| Page padding | `--space-6` / `--space-8` | `--space-4` / `--space-6` |
| Card padding | `--space-6` | `--space-4` |
| Section gap | `--space-16` | `--space-8` |
| Table cell | `--space-4` | `--space-2` `--space-3` |
| Button height | `44px` | `32px`–`36px` |
| Input height | `44px` | `36px` |

Optional density multiplier for layout wrappers:

```css
[data-density="admin"] {
  --density-pad: var(--space-4);
  --density-gap: var(--space-3);
  --density-control-h: 36px;
  --density-section: var(--space-8);
}
```

## Typography

- Same Cormorant + Montserrat.
- Prefer `--font-body-sm` for tables and meta.
- Display sizes rarely above `--font-display-sm` on admin screens.
- Labels still use `--font-label` + tracking (status chips, column headers).

## Color

- Canvas: `--color-bg-subtle`
- Panels: `--color-surface` + `--color-border`
- No separate admin palette. Status chips map to semantic tokens (`success`, `stock-low`, `danger`).

## Components

- Cards: always hairline border; no marketing-style borderless photo cards.
- Buttons: `sm` / `md` sizes from `components.css` (`--btn-h-sm`, `--btn-h-md`).
- Modals: same scrim/focus rules; body content may use compact form grids.

## Do not

- Introduce a second accent for “admin blue”
- Switch body font to Inter / system UI
- Add heavy shadows or colored sidebar gradients
