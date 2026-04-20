import { createHash } from 'node:crypto';
import {
  createGlobalElement,
  findGlobalElementByHash,
  updateGlobalElement,
  updateItem,
  type ElementKind,
  type GlobalElementRecord,
  type ItemRecord,
} from './pocketbase.js';
import { extractVideoId } from './youtubeId.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
]);

export function normalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();

  const videoId = extractVideoId(parsed.toString());
  if (videoId && isYoutubeHost(parsed.hostname)) {
    return `https://youtube.com/watch?v=${videoId}`;
  }

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  return parsed.toString();
}

function isYoutubeHost(host: string): boolean {
  return (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  );
}

export interface ElementIdentity {
  hash: string;
  kind: ElementKind;
  normalized_url?: string;
}

export function computeElementIdentity(item: Pick<ItemRecord, 'type' | 'raw_url'>): ElementIdentity | null {
  if (item.type === 'url' || item.type === 'youtube' || item.type === 'video') {
    if (!item.raw_url) return null;
    const normalized = normalizeUrl(item.raw_url);
    if (!normalized) return null;
    return {
      hash: sha256(normalized),
      kind: 'url',
      normalized_url: normalized,
    };
  }
  return null;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function recordElementSave(item: ItemRecord): Promise<GlobalElementRecord | null> {
  const identity = computeElementIdentity(item);
  if (!identity) return null;

  const now = new Date().toISOString();
  const existing = await findGlobalElementByHash(identity.hash);

  let element: GlobalElementRecord;
  if (existing) {
    element = await updateGlobalElement(existing.id, {
      save_count: (existing.save_count ?? 0) + 1,
      last_saved_at: now,
    });
  } else {
    element = await createGlobalElement({
      element_hash: identity.hash,
      kind: identity.kind,
      normalized_url: identity.normalized_url,
      save_count: 1,
      first_saved_by: item.user,
      first_saved_at: now,
      last_saved_at: now,
      representative_item: item.id,
    });
  }

  if (item.element !== element.id) {
    try {
      await updateItem(item.id, { element: element.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[elements] failed to link item ${item.id} → element ${element.id}: ${msg}`);
    }
  }

  return element;
}
