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

let _queue: Queue<IngestJobData> | null = null;

export function getQueue(): Queue<IngestJobData> {
  if (_queue) return _queue;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  _queue = new Queue<IngestJobData>('ingest', { connection });
  return _queue;
}
