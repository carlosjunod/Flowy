import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config';
import type { ItemType } from './lib/pocketbase.js';

export interface IngestJobData {
  itemId: string;
  type: ItemType;
  raw_url?: string;
  raw_image?: string;
  raw_images?: string[];
  raw_video?: string;
  video_mime?: string;
  /**
   * When set, the job originated from a bulk bookmark import. The worker runs
   * a cheap HEAD probe first and deletes definitively-dead items instead of
   * surfacing them as error cards. It also bumps counters on the batch so the
   * inbox banner can report "X of Y imported, Z dead links removed".
   */
  import_batch_id?: string;
}

export interface IngestJobResult {
  received: true;
}

export const INGEST_QUEUE = 'ingest';
export const BULK_INGEST_QUEUE = 'ingest-bulk';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function createRedisConnection(): ConnectionOptions {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  return connection;
}

export const ingestQueue = new Queue<IngestJobData, IngestJobResult>(INGEST_QUEUE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
  },
});

export const bulkIngestQueue = new Queue<IngestJobData, IngestJobResult>(BULK_INGEST_QUEUE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    // Dead bookmarks shouldn't retry 3×. Transient failures still get one retry.
    attempts: 2,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 86400 },
  },
});

export function createIngestWorker(
  processor: Processor<IngestJobData, IngestJobResult>,
): Worker<IngestJobData, IngestJobResult> {
  return new Worker<IngestJobData, IngestJobResult>(INGEST_QUEUE, processor, {
    connection: createRedisConnection(),
    concurrency: 3,
  });
}

export function createBulkIngestWorker(
  processor: Processor<IngestJobData, IngestJobResult>,
): Worker<IngestJobData, IngestJobResult> {
  return new Worker<IngestJobData, IngestJobResult>(BULK_INGEST_QUEUE, processor, {
    connection: createRedisConnection(),
    // Low concurrency keeps a 2k-item import from starving live share-sheet saves.
    concurrency: 2,
  });
}
