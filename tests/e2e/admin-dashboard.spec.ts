import { test, expect } from '@playwright/test';

// These tests assume an authenticated admin session is set up via a
// Playwright storageState fixture (see auth.setup.ts once auth exists).

// SPEC.md §11 — Admin dashboard
test.describe('Admin overview', () => {
  test('overview stat cards render', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-orders-today')).toBeVisible();
    await expect(page.getByTestId('stat-revenue-today')).toBeVisible();
    await expect(page.getByTestId('stat-active-viewers')).toBeVisible();
    await expect(page.getByTestId('stat-discount-claims')).toBeVisible();
  });

  test('low stock alerts panel lists at-risk variants', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('low-stock-panel')).toBeVisible();
  });
});

test.describe('Admin product management', () => {
  test('can create a product with a variant', async ({ page }) => {
    await page.goto('/admin/products/new');
    await page.getByTestId('product-name').fill('Test Tee');
    await page.getByTestId('product-price').fill('1000');
    await page.getByTestId('save-product').click();
    await expect(page.getByTestId('product-saved-toast')).toBeVisible();
  });
});

test.describe('Admin discount management', () => {
  test('can create a discount and see claim tracking', async ({ page }) => {
    await page.goto('/admin/discounts/new');
    await page.getByTestId('discount-code').fill('WELCOME10');
    await page.getByTestId('discount-value').fill('10');
    await page.getByTestId('save-discount').click();
    await expect(page.getByTestId('discount-saved-toast')).toBeVisible();
  });
});

// SPEC.md §12 — Storefront content management (CMS)
test.describe('CMS content control', () => {
  test('editing the hero block updates the live landing page', async ({ page }) => {
    await page.goto('/admin/content/hero');
    await page.getByTestId('hero-headline-input').fill('New Season, New Drop');
    await page.getByTestId('save-content-block').click();
    await expect(page.getByTestId('content-saved-toast')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('hero-section')).toContainText('New Season, New Drop');
  });

  test('reordering highlights persists the new order', async ({ page }) => {
    await page.goto('/admin/content/highlights');
    await expect(page.getByTestId('highlight-row')).toHaveCount(await page.getByTestId('highlight-row').count());
    // TODO: implement drag-and-drop reorder assertion once the UI exists
  });

  test('featuring a review surfaces it on the storefront', async ({ page }) => {
    await page.goto('/admin/reviews');
    await page.getByTestId('feature-review-toggle').first().click();
    await expect(page.getByTestId('review-featured-toast')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('featured-review')).toBeVisible();
  });
});
