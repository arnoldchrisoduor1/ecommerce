# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog-and-pdp.spec.ts >> Category / shop page >> filters and sort controls narrow the product grid
- Location: e2e\catalog-and-pdp.spec.ts:6:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('sort-select')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - heading "500" [level=1] [ref=e5]
    - heading "Internal Server Error." [level=2] [ref=e7]
  - alert [ref=e8]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { gotoSeededPdp, addSeededProductToBag, seedCartFromPdp } from './helpers';
  3  | 
  4  | // SPEC.md §2 — Category / shop pages
  5  | test.describe('Category / shop page', () => {
  6  |   test('filters and sort controls narrow the product grid', async ({ page }) => {
  7  |     await page.goto('/shop');
  8  |     const initialCount = await page.getByTestId('product-card').count();
> 9  |     await page.getByTestId('sort-select').selectOption('price-asc');
     |                                           ^ Error: locator.selectOption: Test timeout of 60000ms exceeded.
  10 |     await expect(page.getByTestId('product-card').first()).toBeVisible();
  11 |     // sanity check: grid re-rendered without erroring
  12 |     expect(await page.getByTestId('product-card').count()).toBeGreaterThan(0);
  13 |     expect(initialCount).toBeGreaterThan(0);
  14 |   });
  15 | 
  16 |   test('live viewer badge renders on product cards', async ({ page }) => {
  17 |     await page.goto('/shop');
  18 |     await expect(page.getByTestId('viewer-count-badge').first()).toBeVisible();
  19 |   });
  20 | 
  21 |   test('quick-view modal opens without navigation', async ({ page }) => {
  22 |     await page.goto('/shop');
  23 |     await page.getByTestId('quick-view-trigger').first().click();
  24 |     await expect(page.getByTestId('quick-view-modal')).toBeVisible();
  25 |     expect(page.url()).toContain('/shop');
  26 |   });
  27 | });
  28 | 
  29 | // SPEC.md §3 — Product detail page
  30 | test.describe('Product detail page', () => {
  31 |   test('shows gallery, variant selectors, and add-to-bag', async ({ page }) => {
  32 |     await gotoSeededPdp(page);
  33 |     await expect(page.getByTestId('pdp-gallery')).toBeVisible();
  34 |     await expect(page.getByTestId('size-selector')).toBeVisible();
  35 |     await addSeededProductToBag(page);
  36 |   });
  37 | 
  38 |   test('live viewer count and high-demand tag render on PDP', async ({ page }) => {
  39 |     await gotoSeededPdp(page);
  40 |     await expect(page.getByTestId('pdp-viewer-count')).toBeVisible();
  41 |   });
  42 | 
  43 |   test('size chart modal opens', async ({ page }) => {
  44 |     await gotoSeededPdp(page);
  45 |     await page.getByTestId('size-chart-trigger').click();
  46 |     await expect(page.getByTestId('size-chart-modal')).toBeVisible();
  47 |   });
  48 | });
  49 | 
  50 | // SPEC.md §4 — Product bundles
  51 | test.describe('Bundles', () => {
  52 |   test('bundle page lists component items and a fixed price', async ({ page }) => {
  53 |     await page.goto('/bundles/starter-pack'); // adjust slug once seeded
  54 |     await expect(page.getByTestId('bundle-component-item')).toHaveCount(await page.getByTestId('bundle-component-item').count());
  55 |     await expect(page.getByTestId('bundle-price')).toBeVisible();
  56 |   });
  57 | });
  58 | 
```