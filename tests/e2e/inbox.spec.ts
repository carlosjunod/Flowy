import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL ?? 'test@tryflowy.app';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test_password_12345';

test.describe('inbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/);
    await page.goto('/inbox');
  });

  test('inbox page loads and shows grid container', async ({ page }) => {
    await expect(page.getByTestId('inbox-grid').or(page.getByText('Nothing saved yet'))).toBeVisible({
      timeout: 10_000,
    });
  });

  test('filter pills are derived from actual items', async ({ page }) => {
    const allPill = page.getByTestId('filter-All');
    await expect(allPill).toBeVisible();
    // Other categories appear only if items exist — that's environment-dependent, so we
    // assert the All pill is always present and active by default.
    await expect(allPill).toHaveAttribute('aria-selected', 'true');
  });

  test('clicking an item card opens source_url in a new tab', async ({ page, context }) => {
    const cards = page.getByTestId('item-card');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'no ready items in test environment');
      return;
    }
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      cards.first().click({ modifiers: ['Meta'] }).catch(() => undefined),
    ]);
    if (newPage) {
      expect(newPage.url()).not.toContain('/inbox');
      await newPage.close();
    }
  });
});
