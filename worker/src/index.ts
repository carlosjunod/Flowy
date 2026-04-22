import './env.js';
import {
  createIngestWorker,
  createBulkIngestWorker,
  type IngestJobData,
  type IngestJobResult,
} from './queues.js';
import {
  deleteItem,
  getItem,
  incrementImportBatchCounter,
  updateItem,
} from './lib/pocketbase.js';
import { probeUrl } from './lib/linkProbe.js';
import { processUrl } from './processors/url.processor.js';
import { processImage } from './processors/image.processor.js';
import { processScreenshots } from './processors/screenshots.processor.js';
import { processScreenRecording } from './processors/screen_recording.processor.js';
import { processYoutube } from './processors/youtube.processor.js';
import { processVideo } from './processors/video.js';
import { processInstagram } from './processors/instagram.processor.js';
import { processReddit } from './processors/reddit.processor.js';
import type { Job } from 'bullmq';

const PROBE_TYPES = new Set<IngestJobData['type']>([
  'url',
  'youtube',
  'video',
  'instagram',
  'reddit',
]);

async function handleJob(job: Job<IngestJobData, IngestJobResult>): Promise<IngestJobResult> {
  const { itemId, type, raw_image, raw_images, raw_video, video_mime, import_batch_id } = job.data;

  try {
    const item = await getItem(itemId);
    await updateItem(itemId, { status: 'processing' });
    console.log(`[worker] processing item ${itemId} type=${type}${import_batch_id ? ` batch=${import_batch_id}` : ''}`);

    // Bulk-imported URLs get a cheap HEAD probe before we spend Claude tokens.
    // Definitively-dead links (4xx/5xx except 429, or DNS failure) are deleted
    // outright — the user explicitly wants a clean inbox, not red error tiles.
    // Transient causes (timeout, rate-limit) fall through to the normal path.
    if (import_batch_id && item.raw_url && PROBE_TYPES.has(type)) {
      const probe = await probeUrl(item.raw_url);
      if (!probe.ok && probe.reason && probe.reason !== 'TIMEOUT') {
        console.log(`[worker] dead link removed itemId=${itemId} reason=${probe.reason} status=${probe.status}`);
        await deleteItem(itemId).catch((err) => {
          const m = err instanceof Error ? err.message : String(err);
          console.warn(`[worker] failed to delete dead item ${itemId}: ${m}`);
        });
        await incrementImportBatchCounter(import_batch_id, 'dead_count');
        return { received: true };
      }
    }

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
      default:
        await updateItem(itemId, { status: 'ready' });
        break;
    }

    if (import_batch_id) {
      await incrementImportBatchCounter(import_batch_id, 'completed_count');
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
    if (import_batch_id) {
      await incrementImportBatchCounter(import_batch_id, 'failed_count').catch(() => {
        /* already logged */
      });
    }
    console.error(`[worker] job failed itemId=${itemId} type=${type}: ${message}`);
    return { received: true };
  }
}

export { handleJob };

const worker = createIngestWorker(handleJob);
const bulkWorker = createBulkIngestWorker(handleJob);

worker.on('ready', () => console.log('[worker] ready, waiting for jobs...'));
worker.on('error', (err) => console.error('[worker] error:', err.message));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));

bulkWorker.on('ready', () => console.log('[worker:bulk] ready, waiting for bulk jobs...'));
bulkWorker.on('error', (err) => console.error('[worker:bulk] error:', err.message));
bulkWorker.on('failed', (job, err) => console.error(`[worker:bulk] job ${job?.id} failed: ${err.message}`));

process.on('SIGINT', async () => {
  console.log('[worker] shutting down...');
  await Promise.all([worker.close(), bulkWorker.close()]);
  process.exit(0);
});
