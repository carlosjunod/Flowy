#!/usr/bin/env node
// Capture screenshots of Tryflowy web app routes at 3 breakpoints.
// Usage: node .playwright-scripts/capture.mjs <outputDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? '.playwright-baseline');
const BASE = 'http://localhost:4000';

const routes = [
  { name: 'login', path: '/login', auth: false },
  { name: 'inbox', path: '/inbox', auth: true },
  { name: 'chat', path: '/chat', auth: true },
];

const viewports = [
  { name: '375', width: 375, height: 812 },   // mobile
  { name: '768', width: 768, height: 1024 },  // tablet
  { name: '1440', width: 1440, height: 900 }, // desktop
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();

// Set fake pb_auth cookie so the middleware doesn't redirect.
await context.addCookies([
  {
    name: 'pb_auth',
    value: 'fake-token-for-baseline',
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  },
]);

let fail = 0;
for (const r of routes) {
  for (const v of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width: v.width, height: v.height });
    const url = `${BASE}${r.path}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
      // Give empty states + animations time to settle.
      await page.waitForTimeout(700);
      const out = `${OUT}/${r.name}-${v.name}.png`;
      await page.screenshot({ path: out, fullPage: false });
      console.log(`OK  ${r.name} @ ${v.name} -> ${out}`);
    } catch (err) {
      console.error(`FAIL ${r.name} @ ${v.name}: ${err.message}`);
      fail++;
    } finally {
      await page.close();
    }
  }
}

await browser.close();
process.exit(fail ? 1 : 0);
