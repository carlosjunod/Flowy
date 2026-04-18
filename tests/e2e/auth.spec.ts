import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL ?? 'test@tryflowy.app';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test_password_12345';

test.describe('auth', () => {
  test('unauthenticated GET /chat redirects to /login', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('invalid credentials show error and stay on /login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bogus@example.com');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('valid credentials → land on /chat', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('logout from /chat redirects to /login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/);
    await page.getByTestId('logout-button').click();
    await page.waitForURL(/\/login$/, { timeout: 5_000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
