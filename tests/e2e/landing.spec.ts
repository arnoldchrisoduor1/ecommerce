import { test, expect } from '@playwright/test';

// SPEC.md §1 — Landing page
test.describe('Landing page', () => {
  test('renders announcement bar, nav, and hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('announcement-bar')).toBeVisible();
    await expect(page.getByTestId('main-nav')).toBeVisible();
    await expect(page.getByTestId('hero-section')).toBeVisible();
  });

  test('highlights reel is present and opens a story on click', async ({ page }) => {
    await page.goto('/');
    const firstHighlight = page.getByTestId('highlight-item').first();
    await expect(firstHighlight).toBeVisible();
    await firstHighlight.click();
    await expect(page.getByTestId('highlight-viewer')).toBeVisible();
  });

  test('new arrivals grid renders products', async ({ page }) => {
    await page.goto('/');
    const products = page.getByTestId('product-card');
    await expect(products.first()).toBeVisible();
    expect(await products.count()).toBeGreaterThan(0);
  });

  test('email capture form submits successfully', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('email-capture-input').fill('test@example.com');
    await page.getByTestId('email-capture-submit').click();
    await expect(page.getByTestId('email-capture-success')).toBeVisible();
  });

  test('AI stylist chat launcher is visible and opens the widget', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('stylist-chat-launcher').click();
    await expect(page.getByTestId('stylist-chat-panel')).toBeVisible();
  });
});
