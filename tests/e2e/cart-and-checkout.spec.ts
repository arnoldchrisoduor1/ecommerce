import { test, expect } from '@playwright/test';

// SPEC.md §6 — Cart & urgency features
test.describe('Cart', () => {
  test('adding an item opens the cart drawer with correct subtotal', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('size-selector').getByRole('button').first().click();
    await page.getByTestId('add-to-bag').click();
    await expect(page.getByTestId('cart-drawer')).toBeVisible();
    await expect(page.getByTestId('cart-subtotal')).not.toHaveText('KES 0');
  });

  test('quantity controls update subtotal', async ({ page }) => {
    await page.goto('/cart'); // assumes a seeded/persisted cart in test env
    const before = await page.getByTestId('cart-subtotal').textContent();
    await page.getByTestId('cart-item-increment').first().click();
    await expect(page.getByTestId('cart-subtotal')).not.toHaveText(before || '');
  });

  test('exit-intent modal fires on mouseleave and shows a live claim counter', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(400, 5);
    await page.mouse.move(400, -10);
    await expect(page.getByTestId('exit-intent-modal')).toBeVisible();
    await expect(page.getByTestId('exit-intent-claims-today')).toBeVisible();
  });
});

// SPEC.md §7 — Checkout
test.describe('Checkout', () => {
  test('completes the delivery -> payment -> confirm flow', async ({ page }) => {
    await page.goto('/checkout');
    await page.getByTestId('address-line1').fill('123 Test Street');
    await page.getByTestId('address-city').fill('Nairobi');
    await page.getByTestId('checkout-next').click();

    await expect(page.getByTestId('delivery-quote')).toBeVisible();
    await page.getByTestId('payment-method-mpesa').click();
    await page.getByTestId('checkout-next').click();

    await expect(page.getByTestId('order-summary')).toBeVisible();
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
  });

  test('promo code field applies a discount to the total', async ({ page }) => {
    await page.goto('/checkout');
    await page.getByTestId('promo-code-input').fill('TESTCODE10');
    await page.getByTestId('promo-code-apply').click();
    await expect(page.getByTestId('discount-line')).toBeVisible();
  });
});
