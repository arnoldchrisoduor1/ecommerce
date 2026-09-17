# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog-and-pdp.spec.ts >> Category / shop page >> quick-view modal opens without navigation
- Location: e2e\catalog-and-pdp.spec.ts:21:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('quick-view-modal')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('quick-view-modal')

```

```yaml
- banner:
  - link "Studio":
    - /url: /
  - navigation "Primary":
    - link "Shop":
      - /url: /shop
    - link "Tees":
      - /url: /shop?category=tees
    - link "Tanks":
      - /url: /shop?category=tanks
    - link "Bodysuits":
      - /url: /shop?category=bodysuits
    - link "Knitwear":
      - /url: /shop?category=knitwear
  - button "Sign in"
  - button "Search"
  - link "Wishlist":
    - /url: /wishlist
  - button "Cart"
- main:
  - heading "Shop" [level=1]
  - text: Category
  - combobox "Category":
    - option "All" [selected]
    - option "Tees"
    - option "Tanks"
    - option "Bodysuits"
    - option "Knitwear"
  - text: Sort
  - combobox "Sort":
    - option "Recommended" [selected]
    - option "Latest"
    - 'option "Price: low to high"'
    - 'option "Price: high to low"'
  - article:
    - link "Sale Pocket TeeKES 1,199KES 1,399":
      - /url: /product/pocket-tee
  - button "Quick view"
  - article:
    - link "Striped TeeKES 1,499":
      - /url: /product/striped-tee
  - button "Quick view"
  - article:
    - link "Sale Oversized TeeKES 1,299KES 1,599":
      - /url: /product/oversized-tee
  - button "Quick view"
  - article:
    - link "Classic V-Neck TeeKES 1,399":
      - /url: /product/classic-vneck-tee
  - button "Quick view"
  - article:
    - link "Sale Essential Crew TeeKES 999KES 1,299":
      - /url: /product/essential-crew-tee
  - button "Quick view"
  - article:
    - link "Sale Linen Blend TankKES 999KES 1,199":
      - /url: /product/linen-blend-tank
  - button "Quick view"
  - article:
    - link "High Neck TankKES 949":
      - /url: /product/high-neck-tank
  - button "Quick view"
  - article:
    - link "Racerback TankKES 849":
      - /url: /product/racerback-tank
  - button "Quick view"
  - article:
    - link "Longline TankKES 1,099":
      - /url: /product/longline-tank
  - button "Quick view"
  - article:
    - link "Sale Square Neck TankKES 799KES 999":
      - /url: /product/square-neck-tank
  - button "Quick view"
  - article:
    - link "Ribbed TankKES 899":
      - /url: /product/ribbed-tank
  - button "Quick view"
  - article:
    - link "Sale Wrap BodysuitKES 1,799KES 2,099":
      - /url: /product/wrap-bodysuit
  - button "Quick view"
  - navigation "Pagination":
    - button "Previous" [disabled]
    - text: Page 1 of 2
    - button "Next"
- contentinfo:
  - link "Studio":
    - /url: /
  - paragraph: Women's basics made for everyday — soft tees, tanks, and layers with lasting fit.
  - button "Shop"
  - paragraph: Shop
  - list:
    - listitem:
      - link "Tees":
        - /url: /shop?category=tees
    - listitem:
      - link "Tanks":
        - /url: /shop?category=tanks
    - listitem:
      - link "Bodysuits":
        - /url: /shop?category=bodysuits
    - listitem:
      - link "Knitwear":
        - /url: /shop?category=knitwear
  - button "Help"
  - paragraph: Help
  - list:
    - listitem:
      - link "Shipping":
        - /url: /track
    - listitem:
      - link "Returns":
        - /url: /account
    - listitem:
      - link "Contact":
        - /url: mailto:hello@studio.example
    - listitem:
      - link "FAQ":
        - /url: /track
  - button "Company"
  - paragraph: Company
  - list:
    - listitem:
      - link "About":
        - /url: /blog
    - listitem:
      - link "Blog":
        - /url: /blog
  - heading "Newsletter" [level=2]
  - paragraph: Early access to drops and quiet restocks.
  - form "Newsletter":
    - text: Email
    - textbox "Email":
      - /placeholder: you@example.com
    - button "Subscribe"
  - link "Instagram":
    - /url: https://instagram.com
  - link "Pinterest":
    - /url: https://pinterest.com
  - link "TikTok":
    - /url: https://tiktok.com
  - text: M-PesaVisaMastercard
  - paragraph: © 2026 Studio. All rights reserved.
  - paragraph:
    - text: Site by
    - link "arnoldchrisoduor@gmail.com":
      - /url: mailto:arnoldchrisoduor@gmail.com
    - text: ·
    - link "+254 791 165 995":
      - /url: tel:+254791165995
- button "Back to top"
- button "Stylist"
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
  9  |     await page.getByTestId('sort-select').selectOption('price-asc');
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
> 24 |     await expect(page.getByTestId('quick-view-modal')).toBeVisible();
     |                                                        ^ Error: expect(locator).toBeVisible() failed
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