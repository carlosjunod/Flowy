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
}

export interface IngestJobResult {
  received: true;
}

export const INGEST_QUEUE = 'ingest';
export const EXPLORE_QUEUE = 'advanced-exploration';

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

export function createIngestWorker(
  processor: Processor<IngestJobData, IngestJobResult>,
): Worker<IngestJobData, IngestJobResult> {
  return new Worker<IngestJobData, IngestJobResult>(INGEST_QUEUE, processor, {
    connection: createRedisConnection(),
    concurrency: 3,
  });
}

export interface ExploreJobData {
  itemId: string;
  userId: string;
  includeVideoFrames: boolean;
}

export interface ExploreJobResult {
  received: true;
}

export const exploreQueue = new Queue<ExploreJobData, ExploreJobResult>(EXPLORE_QUEUE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 86400 },
  },
});

export function createExploreWorker(
  processor: Processor<ExploreJobData, ExploreJobResult>,
): Worker<ExploreJobData, ExploreJobResult> {
  return new Worker<ExploreJobData, ExploreJobResult>(EXPLORE_QUEUE, processor, {
    connection: createRedisConnection(),
    concurrency: 2,
  });
}
