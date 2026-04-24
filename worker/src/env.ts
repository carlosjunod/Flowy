import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env files with repo-wide fallback:
// 1. repoRoot/.env.local  (highest priority — untracked, developer-specific)
// 2. repoRoot/.env        (fallback — committed defaults)
// 3. worker/.env.local, worker/.env (if someone prefers per-package config)
//
// dotenv's default only picks the CWD's `.env`, which fails when the worker is
// launched from repo root or from the worker/ dir without local overrides.

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(here, '..', '..', '..', '.env.local'),
  join(here, '..', '..', '..', '.env'),
  join(here, '..', '..', '.env.local'),
  join(here, '..', '..', '.env'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
];

const loaded = new Set<string>();
for (const path of candidates) {
  if (!loaded.has(path) && existsSync(path)) {
    config({ path, override: false });
    loaded.add(path);
  }
}

// Base64-encoded cookies (common in Railway/Fly prod env) decode to a tmp file
// and flow into the existing YTDLP_COOKIES_FILE pathway. An explicit _FILE wins
// if both are set — lets operators ship a persistent file when preferred.
const cookiesB64 = process.env.YTDLP_COOKIES_B64?.trim();
if (cookiesB64 && !process.env.YTDLP_COOKIES_FILE?.trim()) {
  try {
    const dir = join(tmpdir(), 'tryflowy');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'ig-cookies.txt');
    writeFileSync(path, Buffer.from(cookiesB64, 'base64'), { mode: 0o600 });
    process.env.YTDLP_COOKIES_FILE = path;
    console.log(`[env] decoded YTDLP_COOKIES_B64 → ${path}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[env] failed to decode YTDLP_COOKIES_B64: ${msg}`);
  }
}
