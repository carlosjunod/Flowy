import './env.js';
import { execFile } from 'node:child_process';
import {
  createExploreWorker,
  createIngestWorker,
  type ExploreJobData,
  type ExploreJobResult,
  type IngestJobData,
  type IngestJobResult,
} from './queues.js';
import { getItem, updateItem } from './lib/pocketbase.js';
import { describeBinaries } from './lib/binaries.js';

// Probe yt-dlp + ffmpeg + ffprobe at startup so deploy logs record which
// binary is actually being used. We resolve through `describeBinaries()`
// so the probe matches what the processors will exec at runtime — not a
// raw $YTDLP_PATH lookup that could disagree with the resolver.
function probeBinaries(): void {
  const { ytdlp, ffmpeg, ffprobe } = describeBinaries();
  console.log(`[boot] resolved binaries ytdlp=${ytdlp} ffmpeg=${ffmpeg} ffprobe=${ffprobe}`);

  execFile(ytdlp, ['--version'], { timeout: 5_000 }, (err, stdout, stderr) => {
    if (err) {
      const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
      const envPath = (process.env.PATH ?? '').slice(0, 500);
      console.error(
        `[boot] yt-dlp probe FAILED path=${ytdlp} code=${code} ` +
          `PATH=${envPath} stderr=${(stderr || '').slice(0, 200)}`,
      );
      console.error(
        '[boot] yt-dlp jobs (instagram/video/reddit transcription) will fail with ENOENT until this is fixed. ' +
          'The postinstall step in worker/scripts/install-ytdlp.mjs should have vendored a binary into worker/bin/. ' +
          'If the file is missing, check the build logs for [install-ytdlp] download failures.',
      );
      return;
    }
    console.log(`[boot] yt-dlp ok path=${ytdlp} version=${stdout.trim()}`);
  });
}
probeBinaries();
import { processUrl } from './processors/url.processor.js';
import { processImage } from './processors/image.processor.js';
import { processScreenshots } from './processors/screenshots.processor.js';
import { processScreenRecording } from './processors/screen_recording.processor.js';
import { processYoutube } from './processors/youtube.processor.js';
import { processVideo } from './processors/video.js';
import { processInstagram } from './processors/instagram.processor.js';
import { processReddit } from './processors/reddit.processor.js';
import { processPinterest } from './processors/pinterest.processor.js';
import { processDribbble } from './processors/dribbble.processor.js';
import { processLinkedin } from './processors/linkedin.processor.js';
import { processTwitter } from './processors/twitter.processor.js';
import { processExplore } from './processors/explore.processor.js';
import { createDigestWorkers, ensureDigestCronRegistered } from './jobs/dailyDigest.js';
import type { Job } from 'bullmq';

async function handleJob(job: Job<IngestJobData, IngestJobResult>): Promise<IngestJobResult> {
  const { itemId, type, raw_image, raw_images, raw_video, video_mime } = job.data;

  try {
    const item = await getItem(itemId);
    await updateItem(itemId, { status: 'processing' });
    console.log(`[worker] processing item ${itemId} type=${type}`);

    switch (type) {
      case 'url':
        await processUrl(item);
        break;
      case 'screenshot': {
        const imgs = Array.isArray(raw_images) && raw_images.length > 0
          ? raw_images
          : raw_image
            ? [raw_image]
            : [];
        if (imgs.length === 0) throw new Error('MISSING_IMAGE');
        if (imgs.length === 1) {
          await processImage(item, imgs[0]!);
        } else {
          await processScreenshots(item, imgs);
        }
        break;
      }
      case 'screen_recording':
        if (!raw_video) throw new Error('MISSING_VIDEO');
        await processScreenRecording(item, raw_video, video_mime);
        break;
      case 'youtube':
        await processYoutube(item);
        break;
      case 'video':
        await processVideo(item);
        break;
      case 'instagram':
        await processInstagram(item);
        break;
      case 'reddit':
        await processReddit(item);
        break;
      case 'pinterest':
        await processPinterest(item);
        break;
      case 'dribbble':
        await processDribbble(item);
        break;
      case 'linkedin':
        await processLinkedin(item);
        break;
      case 'twitter':
        await processTwitter(item);
        break;
      default:
        await updateItem(itemId, { status: 'ready' });
        break;
    }

    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
    try {
      await updateItem(itemId, { status: 'error', error_msg: message });
    } catch (updateErr) {
      const u = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.error(`[worker] failed to mark item ${itemId} as error: ${u}`);
    }
    console.error(`[worker] job failed itemId=${itemId} type=${type}: ${message}`);
    return { received: true };
  }
}

export { handleJob };

const worker = createIngestWorker(handleJob);

worker.on('ready', () => console.log('[worker] ready, waiting for jobs...'));
worker.on('error', (err) => console.error('[worker] error:', err.message));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));

async function handleExploreJob(job: Job<ExploreJobData, ExploreJobResult>): Promise<ExploreJobResult> {
  const { itemId, includeVideoFrames } = job.data;
  try {
    const outcome = await processExplore(itemId, { includeVideoFrames: Boolean(includeVideoFrames) });
    console.log(
      `[explore] item=${itemId} status=${outcome.status} frames=${outcome.framesAnalyzed} candidates=${outcome.candidateCount}` +
        (outcome.primary ? ` primary=${outcome.primary.url}` : ''),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
    console.error(`[explore] job failed item=${itemId}: ${message}`);
  }
  return { received: true };
}

const exploreWorker = createExploreWorker(handleExploreJob);
exploreWorker.on('ready', () => console.log('[explore] worker ready'));
exploreWorker.on('error', (err) => console.error('[explore] error:', err.message));
exploreWorker.on('failed', (job, err) => console.error(`[explore] job ${job?.id} failed: ${err.message}`));

export { handleExploreJob };

const { scheduleWorker, generateWorker } = createDigestWorkers();
scheduleWorker.on('error', (err) => console.error('[digest-schedule] error:', err.message));
scheduleWorker.on('failed', (job, err) =>
  console.error(`[digest-schedule] job ${job?.id} failed: ${err.message}`),
);
generateWorker.on('error', (err) => console.error('[digest-generate] error:', err.message));
generateWorker.on('failed', (job, err) =>
  console.error(`[digest-generate] job ${job?.id} failed: ${err.message}`),
);

void ensureDigestCronRegistered()
  .then(() => console.log('[digest-schedule] cron registered (* * * * *)'))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[digest-schedule] failed to register cron:', msg);
  });

process.on('SIGINT', async () => {
  console.log('[worker] shutting down...');
  await Promise.allSettled([worker.close(), exploreWorker.close(), scheduleWorker.close(), generateWorker.close()]);
  process.exit(0);
});
