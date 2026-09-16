const { chromium } = require('playwright');
const path = require('path');
const dir = path.join('c:/dev/ecommerce/.playwright-mcp/task2');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const sizes = [[375,812,'375'],[768,1024,'768'],[1440,900,'1440']];
  for (const [w,h,label] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    // account empty orders
    await page.goto('http://127.0.0.1:3000/account', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('studio_session_id', crypto.randomUUID());
      localStorage.setItem('studio_account_phone', '0700000000');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/account-empty-${label}.png`, fullPage: true });
    // wishlist empty
    await page.goto('http://127.0.0.1:3000/wishlist', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/wishlist-empty-${label}.png`, fullPage: true });
    // orders empty
    await page.goto('http://127.0.0.1:3000/account/orders', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/orders-empty-${label}.png`, fullPage: true });
  }
  // refresh populated wishlist/orders with known session
  const session = '7acd1916-db66-4107-be0c-31bcb5a64d61';
  for (const [w,h,label] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const p of [
      { path: '/account', name: 'account' },
      { path: '/wishlist', name: 'wishlist' },
      { path: '/account/orders', name: 'orders' },
    ]) {
      await page.goto('http://127.0.0.1:3000' + p.path, { waitUntil: 'domcontentloaded' });
      await page.evaluate((sid) => {
        localStorage.setItem('studio_session_id', sid);
        localStorage.setItem('studio_account_phone', '0712345678');
      }, session);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      if (p.name === 'orders') {
        const btn = page.locator('[data-testid="order-history-item"]').first();
        if (await btn.count()) { await btn.click(); await page.waitForTimeout(700); }
      }
      await page.screenshot({ path: `${dir}/${p.name}-populated-${label}.png`, fullPage: true });
    }
  }
  await browser.close();
  console.log('RESHOT_DONE');
})().catch((e) => { console.error(e); process.exit(1); });
