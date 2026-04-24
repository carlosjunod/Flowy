/**
 * Shared yt-dlp helpers. Both instagram.processor and video use yt-dlp;
 * cookie handling needs to be identical across both.
 *
 * Instagram's public endpoints now return "empty media response" for a growing
 * fraction of reels unless yt-dlp passes auth cookies — and stories require
 * auth unconditionally. Three opt-in env vars:
 *
 *   YTDLP_COOKIES_FILE=/path/to/cookies.txt   (file on disk)
 *   YTDLP_COOKIES_B64=<base64>                (decoded to tmp file at boot;
 *                                              handled in worker/src/env.ts,
 *                                              surfaces here as _FILE)
 *   YTDLP_COOKIES_FROM_BROWSER=chrome         (local dev — reads your browser)
 *
 * File takes precedence; when both _FILE and _FROM_BROWSER are set, _FILE wins.
 * When none is set, yt-dlp runs unauthenticated — some reels will keep failing
 * and all stories will error with `login required`.
 */
export function ytdlpCookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES_FILE?.trim();
  if (file) return ['--cookies', file];
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ['--cookies-from-browser', browser];
  return [];
}
