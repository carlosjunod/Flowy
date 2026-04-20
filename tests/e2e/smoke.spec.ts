import { test, expect, request as apiRequest } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL ?? 'test@tryflowy.app';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test_password_12345';
const PB_URL = process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';
const TEST_URL = process.env.SMOKE_TEST_URL ?? 'https://vercel.com/blog';
const SMOKE_ENABLED = process.env.SMOKE_E2E === '1';

test.describe('smoke test — full user journey', () => {
  test.skip(!SMOKE_ENABLED, 'Set SMOKE_E2E=1 with running services to run the full smoke test');

  test('ingest → worker processes → inbox shows it → chat finds it → click opens URL', async ({ page, context }) => {
    // 1. Auth against PocketBase directly to get a token we can POST to /api/ingest with
    const api = await apiRequest.newContext({ baseURL: PB_URL });
    const authRes = await api.post('/api/collections/users/auth-with-password', {
      data: { identity: EMAIL, password: PASSWORD },
    });
    expect(authRes.ok()).toBe(true);
    const auth = (await authRes.json()) as { token: string; record: { id: string } };

    // 2. POST to /api/ingest with Bearer token
    const ingest = await api.post(`${APP_URL}/api/ingest`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: { type: 'url', raw_url: TEST_URL },
    });
    expect(ingest.status()).toBe(201);
    const { data } = (await ingest.json()) as { data: { id: string } };
    const itemId = data.id;

    // 3. Poll PocketBase until the item is ready (timeout 60s)
    const deadline = Date.now() + 60_000;
    let status = 'pending';
    while (Date.now() < deadline && status !== 'ready' && status !== 'error') {
      await new Promise((r) => setTimeout(r, 2000));
      const got = await api.get(`/api/collections/items/records/${itemId}`, {
        headers: { Authorization: auth.token },
      });
      if (got.ok()) {
        const body = (await got.json()) as { status: string };
        status = body.status;
      }
    }
    expect(status).toBe('ready');

    // 4. Log in in the browser and navigate to /inbox
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/chat$/);
    await page.goto('/inbox');
    await expect(page.getByTestId('inbox-grid')).toBeVisible({ timeout: 10_000 });

    // 5. Verify the item shows up in the grid (at least one card present)
    const cards = page.getByTestId('item-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // 6. Chat search — type a query about the item content
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill('Find the Vercel blog post I just saved');
    await page.getByTestId('chat-send').click();
    await expect(page.locator('[data-testid="item-card"]').first()).toBeVisible({ timeout: 30_000 });

    // 7. Click an item card → opens source URL in new tab
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('item-card').first().click({ modifiers: ['Meta'] }).catch(() => undefined),
    ]);
    if (newPage) {
      expect(newPage.url()).not.toContain('/chat');
      await newPage.close();
    }
  });
});
