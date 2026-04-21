import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface IngestJobData {
  itemId: string;
  type: string;
  raw_url?: string;
  raw_image?: string;
}

export interface GmailSyncJobData {
  userId: string;
  integrationId: string;
  // Upper bound on messages pulled in a single sync. The processor can cap
  // lower based on rate limits; this is just a client-side hint.
  maxMessages?: number;
}

let _ingestQueue: Queue<IngestJobData> | null = null;
let _gmailQueue: Queue<GmailSyncJobData> | null = null;

function redisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function getQueue(): Queue<IngestJobData> {
  if (_ingestQueue) return _ingestQueue;
  _ingestQueue = new Queue<IngestJobData>('ingest', { connection: redisConnection() });
  return _ingestQueue;
}

export const GMAIL_SYNC_QUEUE = 'gmail-sync';

export function getGmailSyncQueue(): Queue<GmailSyncJobData> {
  if (_gmailQueue) return _gmailQueue;
  _gmailQueue = new Queue<GmailSyncJobData>(GMAIL_SYNC_QUEUE, { connection: redisConnection() });
  return _gmailQueue;
}
