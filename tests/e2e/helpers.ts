import { expect, type Page } from '@playwright/test';

/** Seeded catalog product with size/color variants (db/seed.sql). */
export const SEEDED_PRODUCT_SLUG = 'pocket-tee';

export async function gotoSeededPdp(page: Page) {
  await page.goto(`/product/${SEEDED_PRODUCT_SLUG}`);
}

export async function addSeededProductToBag(page: Page) {
  await page
    .getByTestId('size-selector')
    .getByRole('button', { name: 'M', exact: true })
    .click();
  await page
    .getByTestId('color-selector')
    .getByRole('button', { name: 'Black', exact: true })
    .click();
  const addBtn = page.getByTestId('add-to-bag');
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await expect(page.getByTestId('cart-drawer')).toBeVisible({ timeout: 15_000 });
}

export async function seedCartFromPdp(page: Page) {
  await gotoSeededPdp(page);
  await addSeededProductToBag(page);
}
