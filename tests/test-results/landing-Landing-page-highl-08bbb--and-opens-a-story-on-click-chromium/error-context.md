# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page >> highlights reel is present and opens a story on click
- Location: e2e\landing.spec.ts:12:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('highlight-viewer')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('highlight-viewer')

```

```yaml
- status:
  - paragraph: Task32 Alpha
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
- region "Highlights":
  - list:
    - listitem:
      - button "New drop"
      - text: New drop
    - listitem:
      - button "Style guide"
      - text: Style guide
    - listitem:
      - button "Bundles"
      - text: Bundles
- region "Hero":
  - paragraph: Studio
  - heading "New season basics" [level=1]
  - paragraph: Soft tees, tanks, and layers built for everyday
  - link "Shop new arrivals":
    - /url: /shop
- region "New arrivals":
  - heading "New arrivals" [level=2]
  - link "View all":
    - /url: /shop
  - article:
    - link "Striped TeeKES 1,499":
      - /url: /product/striped-tee
  - article:
    - link "Sale Oversized TeeKES 1,299KES 1,599":
      - /url: /product/oversized-tee
  - article:
    - link "Classic V-Neck TeeKES 1,399":
      - /url: /product/classic-vneck-tee
  - article:
    - link "Sale Essential Crew TeeKES 999KES 1,299":
      - /url: /product/essential-crew-tee
  - article:
    - link "Sale Linen Blend TankKES 999KES 1,199":
      - /url: /product/linen-blend-tank
  - article:
    - link "High Neck TankKES 949":
      - /url: /product/high-neck-tank
  - article:
    - link "Racerback TankKES 849":
      - /url: /product/racerback-tank
  - article:
    - link "Sale Pocket TeeKES 1,199KES 1,399":
      - /url: /product/pocket-tee
- region "From customers":
  - heading "From customers" [level=2]
  - list:
    - listitem:
      - paragraph: ★★★★★
      - paragraph: Perfect fit and fabric.
      - paragraph: Amina K.
    - listitem:
      - paragraph: ★★★★★
      - paragraph: Great everyday tank.
      - paragraph: Grace M.
    - listitem:
      - paragraph: ★★★★★
      - paragraph: Cozy knit for Nairobi evenings.
      - paragraph: Linda O.
- region "Style guide":
  - heading "Style guide" [level=2]
  - link "Read more":
    - /url: /blog
  - list:
    - listitem:
      - 'link "Color pairing: neutrals with one accent12 reads"':
        - /url: /blog/color-pairing-basics
    - listitem:
      - link "Knit textures for Nairobi evenings0 reads":
        - /url: /blog/knit-evening-guide
    - listitem:
      - link "Bodysuit styling for all-day wear0 reads":
        - /url: /blog/bodysuit-styling
    - listitem:
      - link "Layering tanks under knits0 reads":
        - /url: /blog/tank-layering-tips
    - listitem:
      - 'link "Tee fits: crew, oversized, and heavyweight0 reads"':
        - /url: /blog/tee-fit-guide
    - listitem:
      - link "How to build a capsule wardrobe2 reads":
        - /url: /blog/capsule-wardrobe-guide
- region "Store stats":
  - paragraph: 12,847
  - paragraph: Items sold
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
- button "Stylist"
- button "Back to top"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // SPEC.md §1 — Landing page
  4  | test.describe('Landing page', () => {
  5  |   test('renders announcement bar, nav, and hero', async ({ page }) => {
  6  |     await page.goto('/');
  7  |     await expect(page.getByTestId('announcement-bar')).toBeVisible();
  8  |     await expect(page.getByTestId('main-nav')).toBeVisible();
  9  |     await expect(page.getByTestId('hero-section')).toBeVisible();
  10 |   });
  11 | 
  12 |   test('highlights reel is present and opens a story on click', async ({ page }) => {
  13 |     await page.goto('/');
  14 |     const firstHighlight = page.getByTestId('highlight-item').first();
  15 |     await expect(firstHighlight).toBeVisible();
  16 |     await firstHighlight.click();
> 17 |     await expect(page.getByTestId('highlight-viewer')).toBeVisible();
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  18 |   });
  19 | 
  20 |   test('new arrivals grid renders products', async ({ page }) => {
  21 |     await page.goto('/');
  22 |     const products = page.getByTestId('product-card');
  23 |     await expect(products.first()).toBeVisible();
  24 |     expect(await products.count()).toBeGreaterThan(0);
  25 |   });
  26 | 
  27 |   test('email capture form submits successfully', async ({ page }) => {
  28 |     await page.goto('/');
  29 |     await page.getByTestId('email-capture-input').fill('test@example.com');
  30 |     await page.getByTestId('email-capture-submit').click();
  31 |     await expect(page.getByTestId('email-capture-success')).toBeVisible();
  32 |   });
  33 | 
  34 |   test('AI stylist chat launcher is visible and opens the widget', async ({ page }) => {
  35 |     await page.goto('/');
  36 |     await page.getByTestId('stylist-chat-launcher').click();
  37 |     await expect(page.getByTestId('stylist-chat-panel')).toBeVisible();
  38 |   });
  39 | });
  40 | 
```