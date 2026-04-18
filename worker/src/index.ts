import 'dotenv/config';
import { createIngestWorker, type IngestJobData, type IngestJobResult } from './queues.js';
import { getItem, updateItem } from './lib/pocketbase.js';
import { processUrl } from './processors/url.processor.js';
import { processImage } from './processors/image.processor.js';
import { processYoutube } from './processors/youtube.processor.js';
import { processVideo } from './processors/video.js';
import type { Job } from 'bullmq';

async function handleJob(job: Job<IngestJobData, IngestJobResult>): Promise<IngestJobResult> {
  const { itemId, type, raw_image } = job.data;

  try {
    const item = await getItem(itemId);
    await updateItem(itemId, { status: 'processing' });
    console.log(`[worker] processing item ${itemId} type=${type}`);

    switch (type) {
      case 'url':
        await processUrl(item);
        break;
      case 'screenshot':
        if (!raw_image) throw new Error('MISSING_IMAGE');
        await processImage(item, raw_image);
        break;
      case 'youtube':
        await processYoutube(item);
        break;
      case 'video':
        await processVideo(item);
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

process.on('SIGINT', async () => {
  console.log('[worker] shutting down...');
  await worker.close();
  process.exit(0);
});
