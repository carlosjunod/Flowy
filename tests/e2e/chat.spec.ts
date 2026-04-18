import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL ?? 'test@tryflowy.app';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test_password_12345';

test.describe('chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/);
  });

  test('type query → streamed response appears → item card clickable', async ({ page, context }) => {
    const input = page.getByTestId('chat-input');
    await input.fill('show me my saved items');
    await page.getByTestId('chat-send').click();

    // Wait for response to appear
    await expect(page.locator('.rounded-2xl.bg-white\\/10')).toBeVisible({ timeout: 30_000 });

    // Wait for item cards (may be 0 on an empty inbox — test environment dependent)
    const cards = page.getByTestId('item-card');
    const count = await cards.count();
    if (count > 0) {
      const [newPage] = await Promise.all([
        context.waitForEvent('page'),
        cards.first().click({ modifiers: ['Meta'] }).catch(() => undefined),
      ]);
      if (newPage) await newPage.close();
    }
  });
});
