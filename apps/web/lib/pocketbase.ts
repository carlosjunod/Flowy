import PocketBase from 'pocketbase';

export type ItemStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ItemType = 'url' | 'screenshot' | 'youtube' | 'receipt' | 'pdf' | 'audio';

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
  created: string;
  updated: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  created: string;
}

const PUBLIC_PB_URL = process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090';
const SERVER_PB_URL = process.env.PB_URL ?? PUBLIC_PB_URL;

export function getPb(): PocketBase {
  // Browser — single module-level singleton so auth persists across route changes.
  if (typeof window !== 'undefined') {
    if (!(globalThis as { __pb__?: PocketBase }).__pb__) {
      (globalThis as { __pb__?: PocketBase }).__pb__ = new PocketBase(PUBLIC_PB_URL);
    }
    return (globalThis as { __pb__?: PocketBase }).__pb__!;
  }
  // Server — fresh client per call (no shared auth state).
  return new PocketBase(SERVER_PB_URL);
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const pb = getPb();
  if (!pb.authStore.isValid) return null;
  const user = pb.authStore.model as UserRecord | null;
  return user;
}

export function logout(): void {
  getPb().authStore.clear();
}

export async function verifyBearerToken(token: string): Promise<UserRecord | null> {
  const pb = getPb();
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    return auth.record as unknown as UserRecord;
  } catch {
    return null;
  } finally {
    pb.authStore.clear();
  }
}
