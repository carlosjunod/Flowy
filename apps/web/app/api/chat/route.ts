import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import type { Item, Embedding } from '@/types';
import { getClaude, generateEmbedding, cosineSimilarity, CHAT_MODEL } from '@/lib/claude';

export const runtime = 'nodejs';

interface ChatRequestBody {
  message?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
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

async function authenticate(req: NextRequest): Promise<AuthResult> {
  // Support both Bearer header (API clients) and cookie-based (browser).
  const header = req.headers.get('authorization');
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else {
    const cookieVal = readCookie(req, 'pb_auth');
    if (cookieVal) {
      try {
        const decoded = decodeURIComponent(cookieVal);
        const parsed = JSON.parse(decoded) as { token?: string };
        token = parsed.token ?? null;
      } catch {
        token = null;
      }
    }
  }
  if (!token) return { ok: false };

  const pb = new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    return { ok: true, userId: auth.record.id, token };
  } catch {
    return { ok: false };
  }
}

async function loadUserEmbeddings(userId: string, token: string): Promise<Embedding[]> {
  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  const records = await pb.collection('embeddings').getFullList<Embedding & { expand?: { item: Item } }>({
    filter: `item.user = "${userId}"`,
    expand: 'item',
    fields: 'id,item,vector',
  });
  return records.map((r) => ({ id: r.id, item: r.item, vector: r.vector, created: '' }));
}

async function loadItemsByIds(ids: string[], userId: string, token: string): Promise<Item[]> {
  if (ids.length === 0) return [];
  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  const quoted = ids.map((id) => `id = "${id}"`).join(' || ');
  const filter = `(${quoted}) && user = "${userId}"`;
  const list = await pb.collection('items').getFullList<Item>({ filter });
  return list;
}

function buildContext(items: Item[]): string {
  return items
    .map((item) => {
      const tags = (item.tags ?? []).join(', ');
      return `<item id="${item.id}">
  title: ${item.title ?? ''}
  type: ${item.type}
  category: ${item.category ?? ''}
  tags: ${tags}
  summary: ${item.summary ?? ''}
  source_url: ${item.source_url ?? item.raw_url ?? ''}
</item>`;
    })
    .join('\n');
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'MISSING_MESSAGE' }, { status: 400 });
  }

  try {
    const [queryVector, embeddings] = await Promise.all([
      generateEmbedding(message),
      loadUserEmbeddings(auth.userId, auth.token),
    ]);

    const scored = embeddings
      .map((e) => ({ item: e.item, score: cosineSimilarity(queryVector, e.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const items = await loadItemsByIds(
      scored.map((s) => s.item),
      auth.userId,
      auth.token,
    );

    const scoreMap = new Map(scored.map((s) => [s.item, s.score]));
    items.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));

    const context = items.length === 0
      ? '<no saved items>'
      : buildContext(items);

    const system = `You are a personal knowledge assistant. Answer only from the provided saved items; when relevant, reference them by their id (e.g. "[item_abc]"). If nothing relevant, respond exactly: "I couldn't find anything relevant in your saved items."\n\nSaved items:\n${context}`;

    const messagesForClaude = [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    const stream = await getClaude().messages.stream({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system,
      messages: messagesForClaude,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    const safeItems = items.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      category: i.category,
      source_url: i.source_url ?? i.raw_url ?? null,
      r2_key: i.r2_key ?? null,
    }));

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-items': JSON.stringify(safeItems),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CHAT_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
