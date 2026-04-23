import PocketBase from 'pocketbase';
import 'dotenv/config';

export type ItemStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ItemType =
  | 'url'
  | 'screenshot'
  | 'youtube'
  | 'receipt'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'instagram'
  | 'reddit'
  | 'screen_recording';

export type MediaSlideKind = 'image' | 'video';

export interface MediaSlide {
  index: number;
  kind: MediaSlideKind;
  r2_key: string;
  source_url?: string;
  summary?: string;
  extracted_text?: string;
}

export interface ItemRecord {
  id: string;
  user: string;
  type: ItemType;
  raw_url?: string;
  r2_key?: string;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  category?: string;
  status: ItemStatus;
  error_msg?: string;
  source_url?: string;
  og_image?: string;
  og_description?: string;
  site_name?: string;
  element?: string;
  media?: MediaSlide[];
  created: string;
  updated: string;
}

export interface EmbeddingRecord {
  id: string;
  item: string;
  vector: number[];
  created: string;
}

export type ElementKind = 'url' | 'content';

export interface GlobalElementRecord {
  id: string;
  element_hash: string;
  kind: ElementKind;
  normalized_url?: string;
  save_count: number;
  first_saved_by?: string;
  first_saved_at: string;
  last_saved_at: string;
  representative_item?: string;
  created: string;
  updated: string;
}

export type InterestSource = 'tag' | 'category';

export interface UserInterestRecord {
  id: string;
  user: string;
  topic: string;
  source: InterestSource;
  count: number;
  last_seen: string;
  created: string;
  updated: string;
}

export interface SaveEventRecord {
  id: string;
  item: string;
  element?: string;
  user: string;
  counted_at: string;
  created: string;
  updated: string;
}

const PB_URL = process.env.PB_URL ?? 'http://localhost:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? '';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? '';

export const pb = new PocketBase(PB_URL);

let authPromise: Promise<void> | null = null;

async function authenticateAdmin(): Promise<void> {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    throw new Error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set');
  }
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
}

export function ensureAuth(): Promise<void> {
  if (!authPromise) {
    authPromise = authenticateAdmin().catch((err) => {
      authPromise = null;
      throw err;
    });
  }
  return authPromise;
}

export async function getItem(id: string): Promise<ItemRecord> {
  await ensureAuth();
  return pb.collection('items').getOne<ItemRecord>(id);
}

export async function updateItem(id: string, patch: Partial<ItemRecord>): Promise<ItemRecord> {
  await ensureAuth();
  return pb.collection('items').update<ItemRecord>(id, patch);
}

export async function createEmbedding(itemId: string, vector: number[]): Promise<EmbeddingRecord> {
  await ensureAuth();
  return pb.collection('embeddings').create<EmbeddingRecord>({ item: itemId, vector });
}

export async function createSaveEvent(data: {
  item: string;
  user: string;
  element?: string;
  counted_at: string;
}): Promise<SaveEventRecord> {
  await ensureAuth();
  return pb.collection('save_events').create<SaveEventRecord>(data);
}

export async function findGlobalElementByHash(hash: string): Promise<GlobalElementRecord | null> {
  await ensureAuth();
  try {
    return await pb
      .collection('global_elements')
      .getFirstListItem<GlobalElementRecord>(`element_hash="${hash}"`);
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function createGlobalElement(data: Omit<GlobalElementRecord, 'id' | 'created' | 'updated'>): Promise<GlobalElementRecord> {
  await ensureAuth();
  return pb.collection('global_elements').create<GlobalElementRecord>(data);
}

export async function updateGlobalElement(id: string, patch: Partial<GlobalElementRecord>): Promise<GlobalElementRecord> {
  await ensureAuth();
  return pb.collection('global_elements').update<GlobalElementRecord>(id, patch);
}

export async function findUserInterest(
  user: string,
  topic: string,
  source: InterestSource,
): Promise<UserInterestRecord | null> {
  await ensureAuth();
  const safeTopic = topic.replace(/"/g, '\\"');
  try {
    return await pb
      .collection('user_interests')
      .getFirstListItem<UserInterestRecord>(
        `user="${user}" && topic="${safeTopic}" && source="${source}"`,
      );
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function createUserInterest(data: {
  user: string;
  topic: string;
  source: InterestSource;
  count: number;
  last_seen: string;
}): Promise<UserInterestRecord> {
  await ensureAuth();
  return pb.collection('user_interests').create<UserInterestRecord>(data);
}

export async function updateUserInterest(id: string, patch: Partial<UserInterestRecord>): Promise<UserInterestRecord> {
  await ensureAuth();
  return pb.collection('user_interests').update<UserInterestRecord>(id, patch);
}

if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
  void ensureAuth().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pb] initial auth failed:', msg);
  });
}
