import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import { createRedisConnection } from '../queues.js';
import { pb, ensureAuth } from '../lib/pocketbase.js';
import { generateDigestForUser, hasRecentDigest } from '../lib/digest/generator.js';

export const DIGEST_SCHEDULE_QUEUE = 'digest-schedule';
export const DIGEST_GENERATE_QUEUE = 'digest-generate';

export interface DigestScheduleJobData {
  // Overrides mostly used in tests — in production the tick fires with empty data.
  now?: string;
}

export interface DigestScheduleJobResult {
  enqueued: number;
  checked: number;
}

export interface DigestGenerateJobData {
  userId: string;
}

export interface DigestGenerateJobResult {
  digestId: string;
  itemsCount: number;
  categoriesCount: number;
  skipped: 'no_items' | 'duplicate' | null;
}

function connection(): ConnectionOptions {
  return createRedisConnection();
}

export const digestScheduleQueue = new Queue<DigestScheduleJobData, DigestScheduleJobResult>(
  DIGEST_SCHEDULE_QUEUE,
  {
    connection: connection(),
    defaultJobOptions: {
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 86400 },
    },
  },
);

export const digestGenerateQueue = new Queue<DigestGenerateJobData, DigestGenerateJobResult>(
  DIGEST_GENERATE_QUEUE,
  {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 7 * 86400 },
    },
  },
);

interface DigestUserRow {
  id: string;
  digest_enabled?: boolean;
  digest_time?: string;
}

function currentUtcHhmm(now: Date): string {
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function findUsersDueNow(nowHhmm: string): Promise<DigestUserRow[]> {
  await ensureAuth();
  const filter = `digest_enabled = true && digest_time = "${nowHhmm}"`;
  return pb.collection('users').getFullList<DigestUserRow>({
    filter,
    fields: 'id,digest_enabled,digest_time',
  });
}

export const scheduleProcessor: Processor<DigestScheduleJobData, DigestScheduleJobResult> = async (job) => {
  const now = job.data.now ? new Date(job.data.now) : new Date();
  const hhmm = currentUtcHhmm(now);
  const users = await findUsersDueNow(hhmm);
  let enqueued = 0;
  for (const user of users) {
    if (await hasRecentDigest(user.id, now)) continue;
    await digestGenerateQueue.add(
      'generate',
      { userId: user.id },
      { jobId: `digest:${user.id}:${now.toISOString().slice(0, 16)}` },
    );
    enqueued += 1;
  }
  console.log(`[digest-schedule] tick=${hhmm} checked=${users.length} enqueued=${enqueued}`);
  return { enqueued, checked: users.length };
};

export const generateProcessor: Processor<DigestGenerateJobData, DigestGenerateJobResult> = async (job) => {
  const { userId } = job.data;
  console.log(`[digest-generate] start user=${userId}`);
  const result = await generateDigestForUser(userId);
  console.log(
    `[digest-generate] done user=${userId} digest=${result.digestId} items=${result.itemsCount} skipped=${result.skipped ?? 'none'}`,
  );
  return result;
};

export function createDigestWorkers(): {
  scheduleWorker: Worker<DigestScheduleJobData, DigestScheduleJobResult>;
  generateWorker: Worker<DigestGenerateJobData, DigestGenerateJobResult>;
} {
  const scheduleWorker = new Worker<DigestScheduleJobData, DigestScheduleJobResult>(
    DIGEST_SCHEDULE_QUEUE,
    scheduleProcessor,
    { connection: connection(), concurrency: 1 },
  );
  const generateWorker = new Worker<DigestGenerateJobData, DigestGenerateJobResult>(
    DIGEST_GENERATE_QUEUE,
    generateProcessor,
    { connection: connection(), concurrency: 2 },
  );
  return { scheduleWorker, generateWorker };
}

export async function ensureDigestCronRegistered(): Promise<void> {
  // Remove stale repeatable schedules (in case we change the pattern later) before adding.
  const repeatables = await digestScheduleQueue.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.name === 'tick' && r.pattern !== '* * * * *') {
      await digestScheduleQueue.removeRepeatableByKey(r.key);
    }
  }
  await digestScheduleQueue.add(
    'tick',
    {},
    {
      repeat: { pattern: '* * * * *' },
      removeOnComplete: { age: 600, count: 60 },
      removeOnFail: { age: 3600 },
    },
  );
}
