/**
 * Resolves absolute paths to the external binaries the worker shells out to:
 *   - yt-dlp  (vendored by `worker/scripts/install-ytdlp.mjs` postinstall)
 *   - ffmpeg  (vendored by `ffmpeg-static`)
 *   - ffprobe (vendored by `ffprobe-static`)
 *
 * Why we don't trust PATH: production runs on Railway under railpack, which
 * boots the worker on a Node-only image with no yt-dlp / ffmpeg installed.
 * Even when an image has them, PATH ordering between build- and run-time
 * has shifted under us before. Resolving to absolute paths from inside the
 * worker package eliminates that whole class of failure.
 *
 * Resolution order for each binary:
 *   1. explicit env var (YTDLP_PATH / FFMPEG_PATH / FFPROBE_PATH)
 *   2. vendored path inside worker (postinstall / ffmpeg-static)
 *   3. bare command name → final fallback to $PATH lookup
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// import.meta.url at runtime points at dist/lib/binaries.js after `tsc`,
// so go up two levels (lib/ → dist/ → worker/) to find vendored bin/.
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, '..', '..');
const vendoredYtdlp = resolve(workerRoot, 'bin', 'yt-dlp');

function resolveStaticPackage(pkg: string): string | null {
  // ffmpeg-static / ffprobe-static export the binary path as the default
  // export. They use `module.exports = "<absolute path>"` (CJS). Use
  // createRequire so this works under both ESM compile output and ts-node.
  try {
    const result = require(pkg) as unknown;
    if (typeof result === 'string' && existsSync(result)) return result;
    if (result && typeof result === 'object' && 'path' in result) {
      const p = (result as { path?: unknown }).path;
      if (typeof p === 'string' && existsSync(p)) return p;
    }
  } catch {
    // package not installed (or download failed); caller falls back.
  }
  return null;
}

export function ytdlpPath(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(vendoredYtdlp)) return vendoredYtdlp;
  return 'yt-dlp';
}

export function ffmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) return fromEnv;
  const fromStatic = resolveStaticPackage('ffmpeg-static');
  if (fromStatic) return fromStatic;
  return 'ffmpeg';
}

export function ffprobePath(): string {
  const fromEnv = process.env.FFPROBE_PATH?.trim();
  if (fromEnv) return fromEnv;
  const fromStatic = resolveStaticPackage('ffprobe-static');
  if (fromStatic) return fromStatic;
  return 'ffprobe';
}

/**
 * One-shot diagnostic dump for the boot probe. Returns each binary's
 * resolved path so deploy logs make it obvious whether vendoring worked.
 */
export function describeBinaries(): { ytdlp: string; ffmpeg: string; ffprobe: string } {
  return { ytdlp: ytdlpPath(), ffmpeg: ffmpegPath(), ffprobe: ffprobePath() };
}
