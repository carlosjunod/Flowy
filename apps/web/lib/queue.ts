import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface IngestJobData {
  itemId: string;
  type: string;
  raw_url?: string;
  raw_image?: string;
  raw_images?: string[];
  raw_video?: string;
  video_mime?: string;
}

export interface ExploreJobData {
  itemId: string;
  userId: string;
  includeVideoFrames: boolean;
}

let _queue: Queue<IngestJobData> | null = null;
let _exploreQueue: Queue<ExploreJobData> | null = null;

function redisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function getQueue(): Queue<IngestJobData> {
  if (_queue) return _queue;
  _queue = new Queue<IngestJobData>('ingest', { connection: redisConnection() });
  return _queue;
}

export function getExploreQueue(): Queue<ExploreJobData> {
  if (_exploreQueue) return _exploreQueue;
  _exploreQueue = new Queue<ExploreJobData>('advanced-exploration', { connection: redisConnection() });
  return _exploreQueue;
}
