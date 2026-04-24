import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL ?? 'test@tryflowy.app';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test_password_12345';

test.describe('bulk delete in inbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/);
    await page.goto('/inbox');
  });

  test('select 3 cards and delete them', async ({ page }) => {
    const cards = page.getByTestId('item-card');
    const initial = await cards.count();
    if (initial < 5) {
      test.skip(true, `need >=5 items in test env, have ${initial}`);
      return;
    }

    await page.getByRole('button', { name: 'Select' }).click();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

    for (let i = 0; i < 3; i++) await cards.nth(i).click();
    await expect(page.getByRole('toolbar', { name: 'Bulk actions' })).toContainText('3 selected');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('toolbar', { name: 'Bulk actions' }).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(/Deleted 3 items/i)).toBeVisible({ timeout: 10_000 });
    await expect(cards).toHaveCount(initial - 3);
  });

  test('Esc exits selection mode', async ({ page }) => {
    const count = await page.getByTestId('item-card').count();
    if (count === 0) {
      test.skip(true, 'no items in test env');
      return;
    }
    await page.getByRole('button', { name: 'Select' }).click();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
  });
});
