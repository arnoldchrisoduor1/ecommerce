# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page >> email capture form submits successfully
- Location: e2e\landing.spec.ts:27:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('email-capture-input')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - status [ref=e3]:
    - paragraph [ref=e4]: Task32 Alpha
  - banner [ref=e5]:
    - generic [ref=e6]:
      - link "Studio" [ref=e7] [cursor=pointer]:
        - /url: /
      - navigation "Primary" [ref=e8]:
        - link "Shop" [ref=e9] [cursor=pointer]:
          - /url: /shop
        - link "Tees" [ref=e10] [cursor=pointer]:
          - /url: /shop?category=tees
        - link "Tanks" [ref=e11] [cursor=pointer]:
          - /url: /shop?category=tanks
        - link "Bodysuits" [ref=e12] [cursor=pointer]:
          - /url: /shop?category=bodysuits
        - link "Knitwear" [ref=e13] [cursor=pointer]:
          - /url: /shop?category=knitwear
      - generic [ref=e14]:
        - button "Sign in" [ref=e15]
        - button "Search" [ref=e18]
        - link "Wishlist" [ref=e21] [cursor=pointer]:
          - /url: /wishlist
        - button "Cart" [ref=e24]
  - region "Highlights" [ref=e27]:
    - list [ref=e28]:
      - listitem [ref=e29]:
        - button "New drop" [ref=e30]
        - text: New drop
      - listitem [ref=e31]:
        - button "Style guide" [ref=e32]
        - text: Style guide
      - listitem [ref=e33]:
        - button "Bundles" [ref=e34]
        - text: Bundles
  - region "Hero" [ref=e35]:
    - generic [ref=e38]:
      - paragraph [ref=e39]: Studio
      - heading "New season basics" [level=1] [ref=e40]
      - paragraph [ref=e41]: Soft tees, tanks, and layers built for everyday
      - link "Shop new arrivals" [ref=e43] [cursor=pointer]:
        - /url: /shop
  - region [ref=e44]:
    - generic [ref=e45]:
      - heading "New arrivals" [level=2] [ref=e46]
      - link "View all" [ref=e47] [cursor=pointer]:
        - /url: /shop
    - generic [ref=e48]:
      - article [ref=e50]:
        - link "Striped TeeKES 1,499" [ref=e51] [cursor=pointer]:
          - /url: /product/striped-tee
      - article [ref=e54]:
        - link "Sale Oversized TeeKES 1,299KES 1,599" [ref=e55] [cursor=pointer]:
          - /url: /product/oversized-tee
          - generic [ref=e56]: Sale
          - generic [ref=e58]:
            - text: Oversized Tee
            - generic [ref=e59]: KES 1,299KES 1,599
      - article [ref=e61]:
        - link "Classic V-Neck TeeKES 1,399" [ref=e62] [cursor=pointer]:
          - /url: /product/classic-vneck-tee
      - article [ref=e65]:
        - link "Sale Essential Crew TeeKES 999KES 1,299" [ref=e66] [cursor=pointer]:
          - /url: /product/essential-crew-tee
          - generic [ref=e67]: Sale
          - generic [ref=e69]:
            - text: Essential Crew Tee
            - generic [ref=e70]: KES 999KES 1,299
      - article [ref=e72]:
        - link "Sale Linen Blend TankKES 999KES 1,199" [ref=e73] [cursor=pointer]:
          - /url: /product/linen-blend-tank
          - generic [ref=e74]: Sale
          - generic [ref=e76]:
            - text: Linen Blend Tank
            - generic [ref=e77]: KES 999KES 1,199
      - article [ref=e79]:
        - link "High Neck TankKES 949" [ref=e80] [cursor=pointer]:
          - /url: /product/high-neck-tank
      - article [ref=e83]:
        - link "Racerback TankKES 849" [ref=e84] [cursor=pointer]:
          - /url: /product/racerback-tank
      - article [ref=e87]:
        - link "Sale Pocket TeeKES 1,199KES 1,399" [ref=e88] [cursor=pointer]:
          - /url: /product/pocket-tee
          - generic [ref=e89]: Sale
          - generic [ref=e91]:
            - text: Pocket Tee
            - generic [ref=e92]: KES 1,199KES 1,399
  - region [ref=e93]:
    - heading "From customers" [level=2] [ref=e94]
    - list [ref=e95]:
      - listitem [ref=e96]:
        - paragraph [ref=e97]: ★★★★★
        - paragraph [ref=e98]: Perfect fit and fabric.
        - paragraph [ref=e99]: Amina K.
      - listitem [ref=e100]:
        - paragraph [ref=e101]: ★★★★★
        - paragraph [ref=e102]: Great everyday tank.
        - paragraph [ref=e103]: Grace M.
      - listitem [ref=e104]:
        - paragraph [ref=e105]: ★★★★★
        - paragraph [ref=e106]: Cozy knit for Nairobi evenings.
        - paragraph [ref=e107]: Linda O.
  - region [ref=e108]:
    - generic [ref=e109]:
      - heading "Style guide" [level=2] [ref=e110]
      - link "Read more" [ref=e111] [cursor=pointer]:
        - /url: /blog
    - list [ref=e112]:
      - listitem [ref=e113]:
        - 'link "Color pairing: neutrals with one accent12 reads" [ref=e114] [cursor=pointer]':
          - /url: /blog/color-pairing-basics
      - listitem [ref=e115]:
        - link "Knit textures for Nairobi evenings0 reads" [ref=e116] [cursor=pointer]:
          - /url: /blog/knit-evening-guide
      - listitem [ref=e117]:
        - link "Bodysuit styling for all-day wear0 reads" [ref=e118] [cursor=pointer]:
          - /url: /blog/bodysuit-styling
      - listitem [ref=e119]:
        - link "Layering tanks under knits0 reads" [ref=e120] [cursor=pointer]:
          - /url: /blog/tank-layering-tips
      - listitem [ref=e121]:
        - 'link "Tee fits: crew, oversized, and heavyweight0 reads" [ref=e122] [cursor=pointer]':
          - /url: /blog/tee-fit-guide
      - listitem [ref=e123]:
        - link "How to build a capsule wardrobe2 reads" [ref=e124] [cursor=pointer]:
          - /url: /blog/capsule-wardrobe-guide
  - region "Store stats" [ref=e125]:
    - paragraph [ref=e126]: 12,847
    - paragraph [ref=e127]: Items sold
  - contentinfo [ref=e128]:
    - generic [ref=e129]:
      - generic [ref=e130]:
        - link "Studio" [ref=e131] [cursor=pointer]:
          - /url: /
        - paragraph [ref=e132]: Women's basics made for everyday — soft tees, tanks, and layers with lasting fit.
      - generic [ref=e133]:
        - generic [ref=e134]:
          - button "Shop" [ref=e135]
          - paragraph [ref=e136]: Shop
          - list [ref=e137]:
            - listitem [ref=e138]:
              - link "Tees" [ref=e139] [cursor=pointer]:
                - /url: /shop?category=tees
            - listitem [ref=e140]:
              - link "Tanks" [ref=e141] [cursor=pointer]:
                - /url: /shop?category=tanks
            - listitem [ref=e142]:
              - link "Bodysuits" [ref=e143] [cursor=pointer]:
                - /url: /shop?category=bodysuits
            - listitem [ref=e144]:
              - link "Knitwear" [ref=e145] [cursor=pointer]:
                - /url: /shop?category=knitwear
        - generic [ref=e146]:
          - button "Help" [ref=e147]
          - paragraph [ref=e148]: Help
          - list [ref=e149]:
            - listitem [ref=e150]:
              - link "Shipping" [ref=e151] [cursor=pointer]:
                - /url: /track
            - listitem [ref=e152]:
              - link "Returns" [ref=e153] [cursor=pointer]:
                - /url: /account
            - listitem [ref=e154]:
              - link "Contact" [ref=e155] [cursor=pointer]:
                - /url: mailto:hello@studio.example
            - listitem [ref=e156]:
              - link "FAQ" [ref=e157] [cursor=pointer]:
                - /url: /track
        - generic [ref=e158]:
          - button "Company" [ref=e159]
          - paragraph [ref=e160]: Company
          - list [ref=e161]:
            - listitem [ref=e162]:
              - link "About" [ref=e163] [cursor=pointer]:
                - /url: /blog
            - listitem [ref=e164]:
              - link "Blog" [ref=e165] [cursor=pointer]:
                - /url: /blog
      - generic [ref=e166]:
        - heading "Newsletter" [level=2] [ref=e167]
        - paragraph [ref=e168]: Early access to drops and quiet restocks.
        - form "Newsletter" [ref=e169]:
          - text: Email
          - textbox "Email" [ref=e170]:
            - /placeholder: you@example.com
          - button "Subscribe" [ref=e171]
    - generic [ref=e172]:
      - generic "Social" [ref=e173]:
        - link "Instagram" [ref=e174] [cursor=pointer]:
          - /url: https://instagram.com
        - link "Pinterest" [ref=e179] [cursor=pointer]:
          - /url: https://pinterest.com
        - link "TikTok" [ref=e183] [cursor=pointer]:
          - /url: https://tiktok.com
      - generic "Payment methods" [ref=e186]: M-PesaVisaMastercard
      - generic [ref=e187]:
        - paragraph [ref=e188]: © 2026 Studio. All rights reserved.
        - paragraph [ref=e189]:
          - text: Site by
          - link "arnoldchrisoduor@gmail.com" [ref=e190] [cursor=pointer]:
            - /url: mailto:arnoldchrisoduor@gmail.com
          - text: ·
          - link "+254 791 165 995" [ref=e191] [cursor=pointer]:
            - /url: tel:+254791165995
  - button "Stylist" [ref=e193]
  - button "Back to top" [ref=e199]
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
  17 |     await expect(page.getByTestId('highlight-viewer')).toBeVisible();
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
> 29 |     await page.getByTestId('email-capture-input').fill('test@example.com');
     |                                                   ^ Error: locator.fill: Test timeout of 60000ms exceeded.
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