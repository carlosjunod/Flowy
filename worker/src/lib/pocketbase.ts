import PocketBase from 'pocketbase';
import 'dotenv/config';

export type ItemStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ItemType = 'url' | 'screenshot' | 'youtube' | 'receipt' | 'pdf' | 'audio' | 'video';

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
  created: string;
  updated: string;
}

export interface EmbeddingRecord {
  id: string;
  item: string;
  vector: number[];
  created: string;
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
  await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
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

if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
  void ensureAuth().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pb] initial auth failed:', msg);
  });
}
