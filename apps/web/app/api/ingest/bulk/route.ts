import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import { createHash } from 'node:crypto';
import { getBulkQueue } from '@/lib/queue';
import { normalizeUrl } from '@/lib/url-normalize';
import { coerceTypeFromUrl } from '@/lib/url-routing';
import type { ItemType } from '@/types';

export const runtime = 'nodejs';

const MAX_BATCH_SIZE = 5000;
const ITEMS_PER_CHUNK = 50;
const MAX_FOLDER_TAGS = 3;
const MAX_FOLDER_SEGMENT_LEN = 40;

interface BulkIngestEntry {
  raw_url: string;
  normalized_url: string;
  element_hash: string;
  title?: string;
  folder_path?: string[];
  add_date?: string;
}

interface BulkIngestBody {
  items?: BulkIngestEntry[];
  batch_label?: string;
  dry_run?: boolean;
}

interface BulkIngestSummary {
  batch_id: string | null;
  accepted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  items: { id: string; raw_url: string }[];
}

type AuthResult = { ok: true; userId: string; token: string } | { ok: false };

function readCookie(req: NextRequest | Request, name: string): string | null {
  const withCookies = req as { cookies?: { get?: (n: string) => { value?: string } | undefined } };
  const direct = withCookies.cookies?.get?.(name)?.value;
  if (direct) return direct;
  const header = req.headers.get('cookie');
  if (!header) return null;
  const match = header.split(/;\s*/).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function tokenFromCookie(raw: string | null): string | null {
  if (!raw) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
  if (decoded.startsWith('{')) {
    try {
      const parsed = JSON.parse(decoded) as { token?: string };
      return parsed.token ?? null;
    } catch {
      return null;
    }
  }
  return decoded;
}

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get('authorization');
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else {
    token = tokenFromCookie(readCookie(req, 'pb_auth'));
  }
  if (!token) return { ok: false };

  const pb = new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    if (!pb.authStore.isValid || !auth.record?.id) return { ok: false };
    return { ok: true, userId: auth.record.id, token };
  } catch {
    return { ok: false };
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface VerifiedEntry {
  raw_url: string;
  normalized_url: string;
  element_hash: string;
  title: string;
  folder_tags: string[];
  bookmarked_at?: string;
  type: ItemType;
}

function verifyEntry(entry: BulkIngestEntry): VerifiedEntry | null {
  if (!entry || typeof entry.raw_url !== 'string') return null;
  const normalized = normalizeUrl(entry.raw_url);
  if (!normalized) return null;
  if (normalized !== entry.normalized_url) return null;
  const hash = sha256Hex(normalized);
  if (hash !== entry.element_hash) return null;

  const folders = Array.isArray(entry.folder_path) ? entry.folder_path : [];
  const folder_tags = folders
    .slice(0, MAX_FOLDER_TAGS)
    .map((f) =>
      typeof f === 'string'
        ? `folder:${f.trim().toLowerCase().slice(0, MAX_FOLDER_SEGMENT_LEN)}`
        : '',
    )
    .filter((t) => t.length > 'folder:'.length);

  return {
    raw_url: entry.raw_url,
    normalized_url: normalized,
    element_hash: hash,
    title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim().slice(0, 500) : entry.raw_url,
    folder_tags,
    bookmarked_at: typeof entry.add_date === 'string' ? entry.add_date : undefined,
    type: coerceTypeFromUrl(entry.raw_url),
  };
}

async function findExistingHashes(
  pb: PocketBase,
  userId: string,
  hashes: string[],
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();

  // Pull the user's existing items that already link to any matching element
  // via element_hash. PocketBase has no JOIN; we do two queries and intersect.
  const batches: string[][] = [];
  for (let i = 0; i < hashes.length; i += 80) {
    batches.push(hashes.slice(i, i + 80));
  }

  const elementIdByHash = new Map<string, string>();
  for (const batch of batches) {
    const filter = batch.map((h) => `element_hash="${h}"`).join(' || ');
    const rows = await pb
      .collection('global_elements')
      .getFullList<{ id: string; element_hash: string }>({ filter });
    for (const row of rows) elementIdByHash.set(row.element_hash, row.id);
  }

  if (elementIdByHash.size === 0) return new Set();

  const elementIds = Array.from(elementIdByHash.values());
  const ownedElementIds = new Set<string>();
  const idBatches: string[][] = [];
  for (let i = 0; i < elementIds.length; i += 80) {
    idBatches.push(elementIds.slice(i, i + 80));
  }
  for (const batch of idBatches) {
    const filter = `user="${userId}" && (${batch.map((id) => `element="${id}"`).join(' || ')})`;
    const rows = await pb
      .collection('items')
      .getFullList<{ id: string; element: string }>({ filter, fields: 'id,element' });
    for (const row of rows) ownedElementIds.add(row.element);
  }

  const existing = new Set<string>();
  for (const [hash, elId] of elementIdByHash.entries()) {
    if (ownedElementIds.has(elId)) existing.add(hash);
  }
  return existing;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: BulkIngestBody;
  try {
    body = (await req.json()) as BulkIngestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : null;
  if (!rawItems) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  if (rawItems.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: 'BATCH_TOO_LARGE' }, { status: 413 });
  }

  const dryRun = body.dry_run === true;

  let skipped_invalid = 0;
  const verified: VerifiedEntry[] = [];
  for (const entry of rawItems) {
    const v = verifyEntry(entry);
    if (!v) {
      // Client-computed hash disagreed, scheme invalid, or URL unparseable.
      if (entry && typeof entry.element_hash === 'string' && entry.normalized_url) {
        // Hash mismatch = tampered or stale client. Reject the whole request
        // so we don't end up with a poisoned global_elements entry.
        const expected = normalizeUrl(entry.raw_url ?? '');
        if (expected && sha256Hex(expected) !== entry.element_hash) {
          return NextResponse.json({ error: 'HASH_MISMATCH' }, { status: 400 });
        }
      }
      skipped_invalid += 1;
      continue;
    }
    verified.push(v);
  }

  if (verified.length === 0 && skipped_invalid === rawItems.length) {
    return NextResponse.json({ error: 'EMPTY_BATCH' }, { status: 400 });
  }

  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(auth.token, null);

  let existing: Set<string>;
  try {
    existing = await findExistingHashes(pb, auth.userId, verified.map((v) => v.element_hash));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'BULK_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const toImport = verified.filter((v) => !existing.has(v.element_hash));
  const skipped_duplicates = verified.length - toImport.length;

  if (dryRun) {
    const summary: BulkIngestSummary = {
      batch_id: null,
      accepted: toImport.length,
      skipped_duplicates,
      skipped_invalid,
      items: [],
    };
    return NextResponse.json({ data: summary });
  }

  if (toImport.length === 0) {
    const summary: BulkIngestSummary = {
      batch_id: null,
      accepted: 0,
      skipped_duplicates,
      skipped_invalid,
      items: [],
    };
    return NextResponse.json({ data: summary });
  }

  let batchId: string;
  try {
    const batch = await pb.collection('import_batches').create<{ id: string }>({
      user: auth.userId,
      label: typeof body.batch_label === 'string' ? body.batch_label.slice(0, 120) : 'Bookmark import',
      status: 'running',
      total: toImport.length,
      completed_count: 0,
      dead_count: 0,
      failed_count: 0,
      started_at: new Date().toISOString(),
    });
    batchId = batch.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'BULK_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const createdItems: { id: string; raw_url: string; type: ItemType; entry: VerifiedEntry }[] = [];
  for (let i = 0; i < toImport.length; i += ITEMS_PER_CHUNK) {
    const chunk = toImport.slice(i, i + ITEMS_PER_CHUNK);
    const results = await Promise.all(
      chunk.map(async (entry) => {
        // TODO(digest): when the daily-digest feature ships, its query must
        // filter `source != 'bookmark_import'` so bulk imports never flood
        // the digest. The `source` field below is the join point.
        const data = {
          type: entry.type,
          raw_url: entry.raw_url,
          source_url: entry.raw_url,
          tags: ['source:bookmark_import', ...entry.folder_tags],
          user: auth.userId,
          status: 'pending',
          source: 'bookmark_import',
          import_batch: batchId,
          original_title: entry.title,
          ...(entry.bookmarked_at ? { bookmarked_at: entry.bookmarked_at } : {}),
        };
        try {
          const rec = await pb.collection('items').create<{ id: string }>(data);
          return { id: rec.id, raw_url: entry.raw_url, type: entry.type, entry };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ingest-bulk] item create failed url=${entry.raw_url}: ${msg}`);
          return null;
        }
      }),
    );
    for (const r of results) if (r) createdItems.push(r);
  }

  // Adjust the batch total if some creates failed so progress tracking matches
  // the number of enqueued jobs.
  if (createdItems.length !== toImport.length) {
    try {
      await pb.collection('import_batches').update(batchId, { total: createdItems.length });
    } catch {
      /* non-fatal */
    }
  }

  const queue = getBulkQueue();
  await Promise.all(
    createdItems.map((ci) =>
      queue.add(
        'ingest-bulk',
        {
          itemId: ci.id,
          type: ci.type,
          raw_url: ci.raw_url,
          import_batch_id: batchId,
        },
        { priority: 10 },
      ),
    ),
  );

  const summary: BulkIngestSummary = {
    batch_id: batchId,
    accepted: createdItems.length,
    skipped_duplicates,
    skipped_invalid,
    items: createdItems.map(({ id, raw_url }) => ({ id, raw_url })),
  };

  return NextResponse.json({ data: summary }, { status: 201 });
}
