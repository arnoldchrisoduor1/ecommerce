import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* Serial workers: Next SSR + API under parallel Playwright goto was
     exceeding navigationTimeout on this host. */
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* iPhone 14 is 390px wide; cart-and-checkout exit-intent uses
       mouse.move(400, …) which WebKit drops outside the viewport.
       14 Plus (428) keeps mobile-safari coverage and receives those events. */
    { name: 'mobile-safari', use: { ...devices['iPhone 14 Plus'] } },
  ],
});
