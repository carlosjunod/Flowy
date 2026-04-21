import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import type { Item, Embedding } from '@/types';
import { getClaude, generateEmbedding, cosineSimilarity, CHAT_MODEL } from '@/lib/claude';
import { authenticate } from '@/lib/auth';

export const runtime = 'nodejs';

interface ChatRequestBody {
  message?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
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

function describeStreamError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
    if (parsed?.error?.type === 'overloaded_error') {
      return "⚠️ Claude is temporarily overloaded. Please try again in a few seconds.";
    }
    if (parsed?.error?.type === 'rate_limit_error') {
      return "⚠️ Rate limit reached. Please wait a moment and retry.";
    }
    if (parsed?.error?.message) return `⚠️ ${parsed.error.message}`;
  } catch {
    // err.message wasn't JSON — fall through to the generic path.
  }
  return "⚠️ Streaming failed. Please try again.";
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

    const system = `You are a personal knowledge assistant. Answer only from the provided saved items.

CITATION RULES:
- Cite an item by inserting its id wrapped in double brackets: [[item_abc]]
- Put the citation immediately after the sentence it supports. Nothing else — no list headers, no type labels, no URLs, no titles in prose.
- If fewer than 3 items are relevant, cite fewer. Never invent ids.
- If nothing relevant, reply exactly: "I couldn't find anything relevant in your saved items."

Saved items:
${context}`;

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
          // Upstream (Anthropic) errored mid-stream — e.g. overloaded_error,
          // rate limit, or dropped connection. Calling controller.error() here
          // leaves the HTTP response half-flushed and surfaces in the browser
          // as `TypeError: Failed to fetch` instead of a readable message.
          // Enqueue a user-facing note and close cleanly so the fetch resolves.
          console.error('[chat] stream error:', err);
          controller.enqueue(encoder.encode(describeStreamError(err)));
          controller.close();
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
