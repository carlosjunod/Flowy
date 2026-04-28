#!/usr/bin/env node
/**
 * Postinstall: download a self-contained yt-dlp binary into worker/bin/.
 *
 * Why this exists: Railway is configured (per service settings) to use
 * railpack, not our Dockerfile, so the apt/pip install of yt-dlp never
 * runs in production. The runtime PATH (/app/worker/node_modules/.bin,
 * /usr/local/bin, …) has no yt-dlp anywhere, and every Instagram /
 * video / reddit-transcription job fails with `spawn yt-dlp ENOENT`.
 *
 * Approach: vendor the official PyInstaller-built yt-dlp release for
 * the host platform at npm-install time. The binary lands at
 * `<worker>/bin/yt-dlp` and is resolved at runtime via
 * `worker/src/lib/binaries.ts`. Works under Docker and railpack alike.
 *
 * Skip in CI / local dev when `SKIP_YTDLP_DOWNLOAD=1` — useful when the
 * machine is offline or already has yt-dlp on PATH.
 */
import { mkdir, chmod, stat, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SKIP = process.env.SKIP_YTDLP_DOWNLOAD === '1';

// Pinned release; bump together with the YTDLP_CACHEBUST in the Dockerfile
// when Instagram ships a breaking change. "latest" is intentionally avoided
// so a build today and a build tomorrow produce the same artifact.
const YTDLP_VERSION = '2025.09.05';
const BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = resolve(__dirname, '..', 'bin');
const target = join(binDir, 'yt-dlp');

function pickAsset() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux';
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64';
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (platform === 'win32') return 'yt-dlp.exe';
  return null;
}

async function fileExistsAndExecutable(path) {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const tmp = `${dest}.partial`;
  // Allow up to 3 redirects (GitHub release → CDN).
  let current = url;
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(current, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) {
    throw new Error(`download failed: ${res?.status ?? 'no response'} ${current}`);
  }
  await rm(tmp, { force: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, dest);
}

async function main() {
  if (SKIP) {
    console.log('[install-ytdlp] SKIP_YTDLP_DOWNLOAD=1, skipping');
    return;
  }
  const asset = pickAsset();
  if (!asset) {
    console.warn(`[install-ytdlp] unsupported platform ${process.platform}/${process.arch}; skipping`);
    return;
  }
  if (await fileExistsAndExecutable(target)) {
    console.log(`[install-ytdlp] already present at ${target}`);
    return;
  }
  await mkdir(binDir, { recursive: true });
  const url = `${BASE}/${asset}`;
  console.log(`[install-ytdlp] downloading ${url} → ${target}`);
  try {
    await download(url, target);
    await chmod(target, 0o755);
    console.log(`[install-ytdlp] installed yt-dlp ${YTDLP_VERSION} at ${target}`);
  } catch (err) {
    // Soft-fail: don't break npm install. The runtime resolver will fall
    // back to PATH lookup of `yt-dlp` and the boot probe will surface the
    // failure in deploy logs if neither path works.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[install-ytdlp] download failed: ${msg}`);
    console.warn('[install-ytdlp] worker will fall back to system yt-dlp on PATH at runtime');
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[install-ytdlp] unexpected error: ${msg}`);
  // Still soft-fail so npm install succeeds.
});
