import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

export const CHAT_MODEL = 'claude-sonnet-4-5';
export const EMBEDDING_DIMS = 1536;

export class ClaudeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let _client: Anthropic | null = null;
export function getClaude(): Anthropic {
  if (_client) return _client;
  if (!ANTHROPIC_API_KEY) throw new ClaudeError('MISSING_API_KEY', 'ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Generate 1536-dim embedding. Uses OpenAI if key is set; else deterministic hash fallback.
 * Mirrors worker/src/lib/claude.ts so client-side and worker-side embeddings share the same space.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000);
  if (OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: trimmed }),
    });
    if (!res.ok) {
      throw new ClaudeError('EMBEDDING_FAILED', `openai ${res.status}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    const vec = json.data[0]?.embedding;
    if (!vec) throw new ClaudeError('EMBEDDING_FAILED', 'no vector');
    return vec;
  }
  return fallbackEmbedding(trimmed);
}

function fallbackEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
  const bytes = new TextEncoder().encode(text || 'empty');
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const idx = (byte * 2654435761 + i) % EMBEDDING_DIMS;
    vec[idx] = (vec[idx] ?? 0) + byte / 255;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
