import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared yt-dlp helpers. Both instagram.processor and video use yt-dlp;
 * cookie handling needs to be identical across both.
 *
 * Instagram's public endpoints now return "empty media response" for a growing
 * fraction of reels unless yt-dlp passes auth cookies. Three opt-in env vars,
 * evaluated in this precedence order:
 *
 *   1. YTDLP_COOKIES_FILE=/path/to/cookies.txt
 *      A filesystem path. Use when you have a persistent volume — mount the
 *      cookies.txt in at that path.
 *
 *   2. YTDLP_COOKIES_B64=<base64>
 *      Base64-encoded cookies.txt content. Decoded to an OS-tempdir file on
 *      first use and memoized. Use this on Railway/Fly/etc. when you do NOT
 *      want to provision a volume — it keeps cookies as just another env var.
 *
 *      Generate with:
 *        yt-dlp --cookies-from-browser chrome --cookies /tmp/ig.txt \
 *          --skip-download https://www.instagram.com/
 *        base64 < /tmp/ig.txt | pbcopy
 *      Then paste into Railway → Variables → YTDLP_COOKIES_B64.
 *
 *   3. YTDLP_COOKIES_FROM_BROWSER=chrome
 *      Local dev only. yt-dlp reads cookies live from your browser. Supports
 *      chrome | safari | firefox | edge | brave | vivaldi | opera.
 *      macOS may prompt for keychain access on first run.
 *
 * With none set, yt-dlp runs unauthenticated (current behavior; some reels
 * will keep failing — same as before this feature shipped).
 */

let b64CookiePath: string | null = null;

function materializeB64(b64: string): string {
  if (b64CookiePath) return b64CookiePath;
  const path = join(tmpdir(), `flowy-ytdlp-cookies-${process.pid}.txt`);
  const content = Buffer.from(b64, 'base64').toString('utf8');
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });
  b64CookiePath = path;
  return path;
}

export function ytdlpCookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES_FILE?.trim();
  if (file) return ['--cookies', file];
  const b64 = process.env.YTDLP_COOKIES_B64?.trim();
  if (b64) return ['--cookies', materializeB64(b64)];
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ['--cookies-from-browser', browser];
  return [];
}
