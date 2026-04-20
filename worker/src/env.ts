import { config } from 'dotenv';
import { existsSync } from 'node:fs';
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
