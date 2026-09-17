# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog-and-pdp.spec.ts >> Product detail page >> shows gallery, variant selectors, and add-to-bag
- Location: e2e\catalog-and-pdp.spec.ts:31:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('size-selector').getByRole('button', { name: 'M', exact: true })
    - locator resolved to <button type="button" aria-disabled="true" title="Out of stock" class="pdp__swatch  pdp__swatch--oos">M</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    92 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - link "Studio" [ref=e4]:
        - /url: /
      - navigation "Primary" [ref=e5]:
        - link "Shop" [ref=e6]:
          - /url: /shop
        - link "Tees" [ref=e7]:
          - /url: /shop?category=tees
        - link "Tanks" [ref=e8]:
          - /url: /shop?category=tanks
        - link "Bodysuits" [ref=e9]:
          - /url: /shop?category=bodysuits
        - link "Knitwear" [ref=e10]:
          - /url: /shop?category=knitwear
      - generic [ref=e11]:
        - button "Sign in" [ref=e12]
        - button "Search" [ref=e15]
        - link "Wishlist" [ref=e18]:
          - /url: /wishlist
        - button "Cart" [ref=e21]
  - main [ref=e24]:
    - generic [ref=e25]:
      - img "Pocket Tee" [ref=e28]
      - generic [ref=e29]:
        - paragraph [ref=e30]: Tees
        - heading "Pocket Tee" [level=1] [ref=e31]
        - paragraph [ref=e32]: KES 1,199 KES 1,399
        - generic [ref=e33]:
          - generic [ref=e34]:
            - text: Size
            - button "Size chart" [ref=e35]
          - generic [ref=e36]:
            - button "L" [ref=e37]
            - button "M" [disabled] [ref=e38]
        - generic [ref=e39]:
          - text: Color
          - generic [ref=e40]:
            - button "White" [ref=e41]
            - button "Black" [disabled] [ref=e42]
        - paragraph [ref=e43]: In stock
        - generic [ref=e44]:
          - button "Add to bag" [ref=e45]
          - button "Save" [ref=e46]
        - paragraph [ref=e47]: Chest pocket detail.
        - list [ref=e48]:
          - listitem [ref=e49]: Secure checkout
          - listitem [ref=e50]: 14-day returns
          - listitem [ref=e51]: Delivery with named courier
          - listitem [ref=e52]: M-Pesa · Card
      - region [ref=e53]:
        - heading "Complete the look" [level=2] [ref=e54]
        - generic [ref=e55]:
          - article [ref=e57]:
            - link "Striped TeeKES 1,499" [ref=e58]:
              - /url: /product/striped-tee
          - article [ref=e61]:
            - link "Sale Oversized TeeKES 1,299KES 1,599" [ref=e62]:
              - /url: /product/oversized-tee
              - generic [ref=e63]: Sale
              - generic [ref=e65]:
                - text: Oversized Tee
                - generic [ref=e66]: KES 1,299KES 1,599
          - article [ref=e68]:
            - link "Classic V-Neck TeeKES 1,399" [ref=e69]:
              - /url: /product/classic-vneck-tee
          - article [ref=e72]:
            - link "Sale Essential Crew TeeKES 999KES 1,299" [ref=e73]:
              - /url: /product/essential-crew-tee
              - generic [ref=e74]: Sale
              - generic [ref=e76]:
                - text: Essential Crew Tee
                - generic [ref=e77]: KES 999KES 1,299
  - contentinfo [ref=e78]:
    - generic [ref=e79]:
      - generic [ref=e80]:
        - link "Studio" [ref=e81]:
          - /url: /
        - paragraph [ref=e82]: Women's basics made for everyday — soft tees, tanks, and layers with lasting fit.
      - generic [ref=e83]:
        - generic [ref=e84]:
          - button "Shop" [ref=e85]
          - paragraph [ref=e86]: Shop
          - list [ref=e87]:
            - listitem [ref=e88]:
              - link "Tees" [ref=e89]:
                - /url: /shop?category=tees
            - listitem [ref=e90]:
              - link "Tanks" [ref=e91]:
                - /url: /shop?category=tanks
            - listitem [ref=e92]:
              - link "Bodysuits" [ref=e93]:
                - /url: /shop?category=bodysuits
            - listitem [ref=e94]:
              - link "Knitwear" [ref=e95]:
                - /url: /shop?category=knitwear
        - generic [ref=e96]:
          - button "Help" [ref=e97]
          - paragraph [ref=e98]: Help
          - list [ref=e99]:
            - listitem [ref=e100]:
              - link "Shipping" [ref=e101]:
                - /url: /track
            - listitem [ref=e102]:
              - link "Returns" [ref=e103]:
                - /url: /account
            - listitem [ref=e104]:
              - link "Contact" [ref=e105]:
                - /url: mailto:hello@studio.example
            - listitem [ref=e106]:
              - link "FAQ" [ref=e107]:
                - /url: /track
        - generic [ref=e108]:
          - button "Company" [ref=e109]
          - paragraph [ref=e110]: Company
          - list [ref=e111]:
            - listitem [ref=e112]:
              - link "About" [ref=e113]:
                - /url: /blog
            - listitem [ref=e114]:
              - link "Blog" [ref=e115]:
                - /url: /blog
      - generic [ref=e116]:
        - heading "Newsletter" [level=2] [ref=e117]
        - paragraph [ref=e118]: Early access to drops and quiet restocks.
        - form "Newsletter" [ref=e119]:
          - text: Email
          - textbox "Email" [ref=e120]:
            - /placeholder: you@example.com
          - button "Subscribe" [ref=e121]
    - generic [ref=e122]:
      - generic "Social" [ref=e123]:
        - link "Instagram" [ref=e124]:
          - /url: https://instagram.com
        - link "Pinterest" [ref=e129]:
          - /url: https://pinterest.com
        - link "TikTok" [ref=e133]:
          - /url: https://tiktok.com
      - generic "Payment methods" [ref=e136]: M-PesaVisaMastercard
      - generic [ref=e137]:
        - paragraph [ref=e138]: © 2026 Studio. All rights reserved.
        - paragraph [ref=e139]:
          - text: Site by
          - link "arnoldchrisoduor@gmail.com" [ref=e140]:
            - /url: mailto:arnoldchrisoduor@gmail.com
          - text: ·
          - link "+254 791 165 995" [ref=e141]:
            - /url: tel:+254791165995
  - button "Back to top" [ref=e142]
  - button "Stylist" [ref=e145]
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test';
  2  | 
  3  | /** Seeded catalog product with size/color variants (db/seed.sql). */
  4  | export const SEEDED_PRODUCT_SLUG = 'pocket-tee';
  5  | 
  6  | export async function gotoSeededPdp(page: Page) {
  7  |   await page.goto(`/product/${SEEDED_PRODUCT_SLUG}`);
  8  | }
  9  | 
  10 | export async function addSeededProductToBag(page: Page) {
  11 |   await page
  12 |     .getByTestId('size-selector')
  13 |     .getByRole('button', { name: 'M', exact: true })
> 14 |     .click();
     |      ^ Error: locator.click: Test timeout of 60000ms exceeded.
  15 |   await page
  16 |     .getByTestId('color-selector')
  17 |     .getByRole('button', { name: 'Black', exact: true })
  18 |     .click();
  19 |   const addBtn = page.getByTestId('add-to-bag');
  20 |   await addBtn.scrollIntoViewIfNeeded();
  21 |   await addBtn.click();
  22 |   await expect(page.getByTestId('cart-drawer')).toBeVisible({ timeout: 15_000 });
  23 | }
  24 | 
  25 | export async function seedCartFromPdp(page: Page) {
  26 |   await gotoSeededPdp(page);
  27 |   await addSeededProductToBag(page);
  28 | }
  29 | 
```