/**
 * Shared yt-dlp helpers. Both instagram.processor and video use yt-dlp;
 * cookie handling needs to be identical across both.
 *
 * Instagram's public endpoints now return "empty media response" for a growing
 * fraction of reels unless yt-dlp passes auth cookies. Two opt-in env vars:
 *
 *   YTDLP_COOKIES_FILE=/path/to/cookies.txt   (works on Railway — ship a file)
 *   YTDLP_COOKIES_FROM_BROWSER=chrome         (local dev — reads your browser)
 *
 * File takes precedence if both set. When neither is set, yt-dlp runs
 * unauthenticated (current behavior — some reels will keep failing).
 */
export function ytdlpCookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES_FILE?.trim();
  if (file) return ['--cookies', file];
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ['--cookies-from-browser', browser];
  return [];
}
