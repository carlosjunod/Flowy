import {
  createUserInterest,
  findUserInterest,
  updateUserInterest,
  type InterestSource,
  type ItemRecord,
} from './pocketbase.js';

const MAX_TOPIC_LEN = 64;

export function normalizeTopic(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_TOPIC_LEN) return null;
  return trimmed;
}

export interface TopicEntry {
  topic: string;
  source: InterestSource;
}

export function collectTopics(item: Pick<ItemRecord, 'tags' | 'category'>): TopicEntry[] {
  const seen = new Set<string>();
  const out: TopicEntry[] = [];

  if (Array.isArray(item.tags)) {
    for (const tag of item.tags) {
      const topic = normalizeTopic(tag);
      if (!topic) continue;
      const key = `tag:${topic}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ topic, source: 'tag' });
    }
  }

  if (item.category) {
    const topic = normalizeTopic(item.category);
    if (topic) {
      const key = `category:${topic}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ topic, source: 'category' });
      }
    }
  }

  return out;
}

export async function recordUserInterests(item: Pick<ItemRecord, 'user' | 'tags' | 'category'>): Promise<number> {
  if (!item.user) return 0;
  const topics = collectTopics(item);
  if (topics.length === 0) return 0;

  const now = new Date().toISOString();
  let written = 0;

  for (const { topic, source } of topics) {
    try {
      const existing = await findUserInterest(item.user, topic, source);
      if (existing) {
        await updateUserInterest(existing.id, {
          count: (existing.count ?? 0) + 1,
          last_seen: now,
        });
      } else {
        await createUserInterest({
          user: item.user,
          topic,
          source,
          count: 1,
          last_seen: now,
        });
      }
      written += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[profiler] topic upsert failed user=${item.user} topic=${topic} source=${source}: ${msg}`);
    }
  }

  return written;
}
