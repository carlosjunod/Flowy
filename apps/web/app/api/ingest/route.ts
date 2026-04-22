import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import { getQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const VALID_TYPES = new Set([
  'url',
  'screenshot',
  'youtube',
  'video',
  'instagram',
  'reddit',
  'receipt',
  'pdf',
  'audio',
  'screen_recording',
]);
const URL_TYPES = new Set(['url', 'youtube', 'video', 'instagram', 'reddit']);
const MAX_IMAGES = 10;

const INSTAGRAM_POST_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
];

function isInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_PATTERNS.some((r) => r.test(url));
}

const REDDIT_POST_PATTERNS = [
  /^https?:\/\/(?:www\.|old\.|new\.|np\.|i\.)?reddit\.com\/r\/[^/]+\/comments\//i,
  /^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/s\//i,
  /^https?:\/\/(?:www\.)?redd\.it\//i,
];

function isRedditPostUrl(url: string): boolean {
  return REDDIT_POST_PATTERNS.some((r) => r.test(url));
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

interface IngestBody {
  type?: string;
  raw_url?: string;
  raw_image?: string;
  raw_images?: string[];
  raw_video?: string;
  video_mime?: string;
  source_url?: string;
}

async function createItem(userToken: string, userId: string, data: Record<string, unknown>): Promise<{ id: string }> {
  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(userToken, null);
  const record = await pb.collection('items').create({ ...data, user: userId, status: 'pending' });
  return { id: record.id };
}

/**
 * Bearer token → share sheet / Chrome extension (mobile, iOS, macOS).
 * Cookie → browser session (web).
 * The future daily-digest can filter `source != 'bookmark_import'`;
 * share vs. web split is bookkeeping for later segmentation.
 */
function inferSource(req: NextRequest): 'share' | 'web' {
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? 'share' : 'web';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  const { type: incomingType, raw_url, raw_image, raw_images, raw_video, video_mime, source_url } = body;
  if (!incomingType || typeof incomingType !== 'string' || !VALID_TYPES.has(incomingType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  if (URL_TYPES.has(incomingType)) {
    if (!raw_url || typeof raw_url !== 'string') {
      return NextResponse.json({ error: 'MISSING_URL' }, { status: 400 });
    }
  }

  // Auto-route Instagram post/carousel URLs to the instagram processor.
  // Reels stay on whatever type the client picked (usually `video`).
  // Reddit comment/share URLs route to the reddit processor.
  const type =
    (incomingType === 'url' || incomingType === 'video') && raw_url && isInstagramPostUrl(raw_url)
      ? 'instagram'
      : (incomingType === 'url' || incomingType === 'video') && raw_url && isRedditPostUrl(raw_url)
      ? 'reddit'
      : incomingType;

  // Normalize images into an array. Accept `raw_images` (multi) or legacy `raw_image` (single).
  let images: string[] = [];
  if (Array.isArray(raw_images) && raw_images.length > 0) {
    images = raw_images.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } else if (typeof raw_image === 'string' && raw_image.length > 0) {
    images = [raw_image];
  }
  if (images.length > MAX_IMAGES) images = images.slice(0, MAX_IMAGES);

  if (type === 'screenshot') {
    if (images.length === 0) {
      return NextResponse.json({ error: 'MISSING_IMAGE' }, { status: 400 });
    }
  }
  if (type === 'screen_recording') {
    if (!raw_video || typeof raw_video !== 'string') {
      return NextResponse.json({ error: 'MISSING_VIDEO' }, { status: 400 });
    }
  }

  try {
    const itemData: Record<string, unknown> = {
      type,
      tags: [],
      source: inferSource(req),
    };
    if (raw_url) itemData.raw_url = raw_url;
    if (source_url) itemData.source_url = source_url;
    else if (raw_url) itemData.source_url = raw_url;

    const { id } = await createItem(auth.token, auth.userId, itemData);

    const queue = getQueue();
    await queue.add('ingest', {
      itemId: id,
      type,
      raw_url,
      // Preserve legacy single-image field so existing workers keep working.
      raw_image: images[0],
      raw_images: images.length > 0 ? images : undefined,
      raw_video,
      video_mime,
    });

    return NextResponse.json({ data: { id, status: 'pending' } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'INGEST_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
