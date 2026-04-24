import './env.js';
import { createIngestWorker, type IngestJobData, type IngestJobResult } from './queues.js';
import { getItem, updateItem } from './lib/pocketbase.js';
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
  await Promise.allSettled([worker.close(), scheduleWorker.close(), generateWorker.close()]);
  process.exit(0);
});
