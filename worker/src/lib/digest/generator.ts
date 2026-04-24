import { pb, ensureAuth, type ItemRecord } from '../pocketbase.js';
import { ClaudeError, getClaude } from '../claude.js';
import { groupByCategory, itemImageUrl } from './grouper.js';
import { buildCategoryPrompt } from './prompt.js';
import type { DigestContent, DigestRecord, DigestSection } from './types.js';
import { sendPush } from './push.js';

export const DIGEST_MODEL = 'claude-sonnet-4-20250514';
const DIGEST_WINDOW_HOURS = 24;
const DIGEST_DEDUP_HOURS = 23;

export class DigestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DigestError';
  }
}

interface UserRecord {
  id: string;
  email?: string;
  push_token?: string;
  digest_enabled?: boolean;
  digest_time?: string;
}

export async function getUser(userId: string): Promise<UserRecord> {
  await ensureAuth();
  return pb.collection('users').getOne<UserRecord>(userId, { requestKey: null });
}

async function fetchRecentItems(userId: string, sinceIso: string): Promise<ItemRecord[]> {
  await ensureAuth();
  const safeUser = userId.replace(/"/g, '');
  const filter = `user = "${safeUser}" && status = "ready" && created >= "${sinceIso}"`;
  return pb.collection('items').getFullList<ItemRecord>({
    filter,
    sort: '-created',
    requestKey: null,
  });
}

export async function hasRecentDigest(userId: string, now: Date): Promise<boolean> {
  await ensureAuth();
  const threshold = new Date(now.getTime() - DIGEST_DEDUP_HOURS * 3600_000).toISOString();
  const safeUser = userId.replace(/"/g, '');
  try {
    await pb
      .collection('digests')
      .getFirstListItem<DigestRecord>(
        `user = "${safeUser}" && generated_at >= "${threshold}"`,
        { requestKey: null },
      );
    return true;
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return false;
    }
    throw err;
  }
}

interface SectionModelResult {
  category: string;
  summary: string;
  image_urls: string[];
}

function parseSectionJson(text: string): SectionModelResult {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new DigestError('PARSE_FAILED', `no JSON object in response: ${text.slice(0, 200)}`);
  }
  let parsed: Partial<SectionModelResult>;
  try {
    parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Partial<SectionModelResult>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DigestError('PARSE_FAILED', `invalid JSON: ${msg}`);
  }
  return {
    category: String(parsed.category ?? '').trim(),
    summary: String(parsed.summary ?? '').trim(),
    image_urls: Array.isArray(parsed.image_urls)
      ? parsed.image_urls.filter((v): v is string => typeof v === 'string').slice(0, 3)
      : [],
  };
}

async function summarizeCategory(
  category: string,
  items: ItemRecord[],
): Promise<DigestSection> {
  const { system, user, availableImageUrls } = buildCategoryPrompt(category, items);
  try {
    const resp = await getClaude().messages.create({
      model: DIGEST_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new DigestError('NO_TEXT_RESPONSE', 'Claude returned no text block');
    }
    const parsed = parseSectionJson(textBlock.text);
    // Enforce that the model only returns URLs we offered, preserving order returned.
    const allowed = new Set(availableImageUrls);
    const filteredImages = parsed.image_urls.filter((u) => allowed.has(u));
    const fallbackImages = filteredImages.length === 0
      ? items.map(itemImageUrl).filter((u): u is string => Boolean(u)).slice(0, 3)
      : filteredImages;

    return {
      category: parsed.category || category,
      summary: parsed.summary,
      image_urls: fallbackImages,
      item_ids: items.map((i) => i.id),
    };
  } catch (err) {
    if (err instanceof DigestError) throw err;
    if (err instanceof ClaudeError) throw new DigestError('CLAUDE_FAILED', err.message);
    const msg = err instanceof Error ? err.message : String(err);
    throw new DigestError('CLAUDE_FAILED', msg);
  }
}

export interface GenerateDigestResult {
  digestId: string;
  itemsCount: number;
  categoriesCount: number;
  skipped: 'no_items' | 'duplicate' | null;
}

export async function generateDigestForUser(userId: string): Promise<GenerateDigestResult> {
  const now = new Date();

  if (await hasRecentDigest(userId, now)) {
    return { digestId: '', itemsCount: 0, categoriesCount: 0, skipped: 'duplicate' };
  }

  const windowStart = new Date(now.getTime() - DIGEST_WINDOW_HOURS * 3600_000);
  const items = await fetchRecentItems(userId, windowStart.toISOString());

  if (items.length === 0) {
    return { digestId: '', itemsCount: 0, categoriesCount: 0, skipped: 'no_items' };
  }

  const grouped = groupByCategory(items);
  const sections: DigestSection[] = [];
  for (const [category, groupItems] of grouped.entries()) {
    const section = await summarizeCategory(category, groupItems);
    sections.push(section);
  }

  const content: DigestContent = {
    sections,
    window_start: windowStart.toISOString(),
    window_end: now.toISOString(),
  };

  await ensureAuth();
  const record = await pb.collection('digests').create<DigestRecord>(
    {
      user: userId,
      generated_at: now.toISOString(),
      content,
      items_count: items.length,
      categories_count: sections.length,
    },
    { requestKey: null },
  );

  const user = await getUser(userId).catch(() => null);
  const push = await sendPush(user?.push_token, {
    title: 'Your Daily Digest is ready',
    body: `${items.length} item${items.length === 1 ? '' : 's'} across ${sections.length} categor${sections.length === 1 ? 'y' : 'ies'} from the last 24 hours`,
    data: { digestId: record.id, url: `/digest/${record.id}` },
  });
  if (!push.sent) {
    console.warn(`[digest] push not sent for user=${userId} digest=${record.id}: ${push.reason ?? 'unknown'}`);
  }

  return {
    digestId: record.id,
    itemsCount: items.length,
    categoriesCount: sections.length,
    skipped: null,
  };
}
