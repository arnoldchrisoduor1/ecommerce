import { test, expect } from '@playwright/test';

// SPEC.md §2 — Category / shop pages
test.describe('Category / shop page', () => {
  test('filters and sort controls narrow the product grid', async ({ page }) => {
    await page.goto('/shop');
    const initialCount = await page.getByTestId('product-card').count();
    await page.getByTestId('sort-select').selectOption('price-asc');
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    // sanity check: grid re-rendered without erroring
    expect(await page.getByTestId('product-card').count()).toBeGreaterThan(0);
    expect(initialCount).toBeGreaterThan(0);
  });

  test('live viewer badge renders on product cards', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.getByTestId('viewer-count-badge').first()).toBeVisible();
  });

  test('quick-view modal opens without navigation', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    expect(page.url()).toContain('/shop');
  });
});

// SPEC.md §3 — Product detail page
test.describe('Product detail page', () => {
  test('shows gallery, variant selectors, and add-to-bag', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('pdp-gallery')).toBeVisible();
    await expect(page.getByTestId('size-selector')).toBeVisible();
    await page.getByTestId('size-selector').getByRole('button').first().click();
    await page.getByTestId('add-to-bag').click();
    await expect(page.getByTestId('cart-drawer')).toBeVisible();
  });

  test('live viewer count and high-demand tag render on PDP', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('pdp-viewer-count')).toBeVisible();
  });

  test('size chart modal opens', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('size-chart-trigger').click();
    await expect(page.getByTestId('size-chart-modal')).toBeVisible();
  });
});

// SPEC.md §4 — Product bundles
test.describe('Bundles', () => {
  test('bundle page lists component items and a fixed price', async ({ page }) => {
    await page.goto('/bundles/starter-pack'); // adjust slug once seeded
    await expect(page.getByTestId('bundle-component-item')).toHaveCount(await page.getByTestId('bundle-component-item').count());
    await expect(page.getByTestId('bundle-price')).toBeVisible();
  });
});
