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
  import_batch_id?: string;
}

let _queue: Queue<IngestJobData> | null = null;
let _bulkQueue: Queue<IngestJobData> | null = null;

function makeConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function getQueue(): Queue<IngestJobData> {
  if (_queue) return _queue;
  _queue = new Queue<IngestJobData>('ingest', { connection: makeConnection() });
  return _queue;
}

export function getBulkQueue(): Queue<IngestJobData> {
  if (_bulkQueue) return _bulkQueue;
  _bulkQueue = new Queue<IngestJobData>('ingest-bulk', { connection: makeConnection() });
  return _bulkQueue;
}
