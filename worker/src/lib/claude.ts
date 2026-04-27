import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

export const MODEL = 'claude-sonnet-4-5';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export class ClaudeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ClaudeError';
  }
}

let _client: Anthropic | null = null;
export function getClaude(): Anthropic {
  if (_client) return _client;
  if (!ANTHROPIC_API_KEY) {
    throw new ClaudeError('MISSING_API_KEY', 'ANTHROPIC_API_KEY is not set');
  }
  _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

export interface StructuredData {
  title: string;
  summary: string;
  tags: string[];
  category: string;
}

const EXTRACT_SYSTEM_PROMPT = `You are a content classifier. Given raw text, respond with ONLY a single JSON object — no prose, no code fences — matching this exact shape:

{
  "title": string,              // short, clear title — max 80 chars
  "summary": string,            // concise summary — max 200 chars
  "tags": string[],             // up to 5 lowercase tags, each 1-3 words
  "category": string            // single lowercase word category (e.g. "design", "dev", "food")
}

If the text is empty, nonsense, or unparseable, still return the JSON with best-effort guesses.`;

function parseJson(text: string): StructuredData {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new ClaudeError('PARSE_FAILED', `no JSON object in response: ${text.slice(0, 200)}`);
  }
  const slice = text.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(slice) as Partial<StructuredData>;
    return {
      title: String(parsed.title ?? '').slice(0, 200),
      summary: String(parsed.summary ?? '').slice(0, 500),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map((t) => String(t)) : [],
      category: String(parsed.category ?? 'uncategorized').toLowerCase().split(/\s+/)[0] ?? 'uncategorized',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClaudeError('PARSE_FAILED', `invalid JSON: ${msg}`);
  }
}

export async function extractStructuredData(content: string): Promise<StructuredData> {
  const trimmed = content.slice(0, 50_000); // Claude input bound
  try {
    const resp = await getClaude().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: trimmed || 'empty content' }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new ClaudeError('NO_TEXT_RESPONSE', 'Claude returned no text block');
    }
    return parseJson(textBlock.text);
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClaudeError('EXTRACTION_FAILED', msg);
  }
}

interface VisionArgs {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string;
}

const VISION_SYSTEM_PROMPT = `You are a visual content classifier. Given an image, respond with ONLY a single JSON object — no prose, no code fences — matching this exact shape:

{
  "title": string,              // short, clear title — max 80 chars
  "summary": string,            // concise summary — max 200 chars
  "tags": string[],             // up to 5 lowercase tags
  "category": string,           // single lowercase word category
  "extracted_text": string      // all visible text in image, joined with newlines
}`;

export interface VisionResult extends StructuredData {
  extracted_text: string;
}

export async function analyzeImage({ mediaType, data }: VisionArgs): Promise<VisionResult> {
  try {
    const resp = await getClaude().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: VISION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data },
            },
            {
              type: 'text',
              text: 'Classify this image per the system schema.',
            },
          ],
        },
      ],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new ClaudeError('NO_TEXT_RESPONSE', 'Claude returned no text block');
    }
    const firstBrace = textBlock.text.indexOf('{');
    const lastBrace = textBlock.text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new ClaudeError('VISION_PARSE_FAILED', 'no JSON in vision response');
    }
    let parsed: Partial<VisionResult>;
    try {
      parsed = JSON.parse(textBlock.text.slice(firstBrace, lastBrace + 1)) as Partial<VisionResult>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ClaudeError('VISION_PARSE_FAILED', msg);
    }
    return {
      title: String(parsed.title ?? '').slice(0, 200),
      summary: String(parsed.summary ?? '').slice(0, 500),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      category: String(parsed.category ?? 'uncategorized').toLowerCase().split(/\s+/)[0] ?? 'uncategorized',
      extracted_text: String(parsed.extracted_text ?? ''),
    };
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClaudeError('VISION_FAILED', msg);
  }
}

const MULTI_IMAGE_SYSTEM_PROMPT = `You are a visual content classifier analyzing a set of images shared together as a single entry (e.g. a series of screenshots).

Look at every image, then determine whether they tell one coherent story or are unrelated fragments. Respond with ONLY a single JSON object — no prose, no code fences — matching this exact shape:

{
  "title": string,              // short, clear title for the whole group — max 80 chars
  "summary": string,            // concise summary that stitches the pieces together — max 200 chars
  "tags": string[],             // up to 5 lowercase tags that apply to the whole set
  "category": string,           // single lowercase word category
  "extracted_text": string,     // all visible text across all images, joined with newlines, in order
  "coherence": "related" | "unrelated",
  "coherence_note": string,     // if unrelated, a short note explaining that the pieces don't seem related; empty string if related
  "per_image": [                // one entry per image, in the order they were provided
    { "summary": string, "extracted_text": string }
  ]
}`;

export interface MultiImageResult extends StructuredData {
  extracted_text: string;
  coherence: 'related' | 'unrelated';
  coherence_note: string;
  per_image: { summary: string; extracted_text: string }[];
}

export async function analyzeImages(
  images: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }[],
): Promise<MultiImageResult> {
  if (images.length === 0) {
    throw new ClaudeError('VISION_FAILED', 'no images to analyze');
  }
  try {
    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    > = [];
    images.forEach((img, i) => {
      content.push({ type: 'text', text: `Image ${i + 1} of ${images.length}:` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      });
    });
    content.push({
      type: 'text',
      text: 'Classify the set per the system schema. The per_image array must have exactly one entry per image in order.',
    });

    const resp = await getClaude().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: MULTI_IMAGE_SYSTEM_PROMPT,
      // The SDK types accept this shape via union; cast to keep this file free of SDK namespace types.
      messages: [{ role: 'user', content: content as never }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new ClaudeError('NO_TEXT_RESPONSE', 'Claude returned no text block');
    }
    const firstBrace = textBlock.text.indexOf('{');
    const lastBrace = textBlock.text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new ClaudeError('VISION_PARSE_FAILED', 'no JSON in vision response');
    }
    let parsed: Partial<MultiImageResult>;
    try {
      parsed = JSON.parse(textBlock.text.slice(firstBrace, lastBrace + 1)) as Partial<MultiImageResult>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ClaudeError('VISION_PARSE_FAILED', msg);
    }
    const perImage = Array.isArray(parsed.per_image) ? parsed.per_image : [];
    const normalizedPerImage = images.map((_, i) => {
      const entry = perImage[i] ?? {};
      return {
        summary: String((entry as { summary?: unknown }).summary ?? '').slice(0, 400),
        extracted_text: String((entry as { extracted_text?: unknown }).extracted_text ?? ''),
      };
    });
    const coherence = parsed.coherence === 'unrelated' ? 'unrelated' : 'related';
    return {
      title: String(parsed.title ?? '').slice(0, 200),
      summary: String(parsed.summary ?? '').slice(0, 500),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      category: String(parsed.category ?? 'uncategorized').toLowerCase().split(/\s+/)[0] ?? 'uncategorized',
      extracted_text: String(parsed.extracted_text ?? ''),
      coherence,
      coherence_note: String(parsed.coherence_note ?? ''),
      per_image: normalizedPerImage,
    };
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClaudeError('VISION_FAILED', msg);
  }
}

const IDENTIFY_SYSTEM_PROMPT = `You are an expert content investigator. Given a saved item (text, transcript, OCR, and optionally video frames), determine the SPECIFIC tool, product, repository, paper, or app the content is about.

Strategy:
1. Read all the provided context — title, summary, body, OCR/extracted text from frames, on-screen visuals.
2. Use the web_search tool when needed to verify or discover the canonical link. Prefer:
   - github.com (free/open-source repos) > official site > docs > npm > Hugging Face > App Store
3. Only set primary_link when confidence ≥ 0.7 that this URL is the right canonical destination.
4. List up to 5 candidates as alternatives — even when primary_link is set — to give the user fallback options.
5. If the content is not about any specific identifiable product, return primary_link: null and status: "no_match".

Respond with ONLY a single JSON object — no prose, no code fences — matching:

{
  "status": "enriched" | "no_match",
  "primary_link": null | { "url": string, "title": string, "kind": "github"|"product"|"docs"|"app_store"|"other", "confidence": number },
  "candidates": [ { "name": string, "url": string|null, "kind": "github"|"product"|"docs"|"app_store"|"other", "confidence": number, "reason": string } ],
  "notes": string
}

confidence is 0..1. Tighter is better than loose.`;

export interface IdentifyLink {
  url: string;
  title: string;
  kind: 'github' | 'product' | 'docs' | 'app_store' | 'other';
  confidence: number;
}

export interface IdentifyCandidate {
  name: string;
  url?: string;
  kind: 'github' | 'product' | 'docs' | 'app_store' | 'other';
  confidence: number;
  reason: string;
}

export interface IdentifyResult {
  status: 'enriched' | 'no_match';
  primary_link?: IdentifyLink;
  candidates: IdentifyCandidate[];
  notes: string;
}

export interface IdentifyInput {
  context: string;
  frames?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }[];
  enableWebSearch?: boolean;
}

function normalizeKind(raw: unknown): IdentifyLink['kind'] {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'github' || v === 'product' || v === 'docs' || v === 'app_store' || v === 'other') return v;
  return 'other';
}

function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function extractJsonBlock(text: string): string | null {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function parseIdentifyJson(text: string): IdentifyResult {
  const slice = extractJsonBlock(text);
  if (!slice) throw new ClaudeError('IDENTIFY_PARSE_FAILED', 'no JSON in response');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(slice) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClaudeError('IDENTIFY_PARSE_FAILED', msg);
  }
  const status = raw.status === 'enriched' ? 'enriched' : 'no_match';
  let primary: IdentifyLink | undefined;
  const rawPrimary = raw.primary_link;
  if (rawPrimary && typeof rawPrimary === 'object') {
    const p = rawPrimary as Record<string, unknown>;
    const url = typeof p.url === 'string' ? p.url.trim() : '';
    if (url && /^https?:\/\//i.test(url)) {
      primary = {
        url,
        title: String(p.title ?? '').slice(0, 200),
        kind: normalizeKind(p.kind),
        confidence: clampConfidence(p.confidence),
      };
    }
  }
  const candidatesRaw = Array.isArray(raw.candidates) ? raw.candidates : [];
  const candidates: IdentifyCandidate[] = candidatesRaw.slice(0, 5).map((c) => {
    const rec = (c ?? {}) as Record<string, unknown>;
    const rawUrl = typeof rec.url === 'string' ? rec.url.trim() : '';
    const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;
    return {
      name: String(rec.name ?? '').slice(0, 200),
      url,
      kind: normalizeKind(rec.kind),
      confidence: clampConfidence(rec.confidence),
      reason: String(rec.reason ?? '').slice(0, 500),
    };
  }).filter((c) => c.name.length > 0);
  return {
    status: primary || candidates.length > 0 ? status : 'no_match',
    primary_link: primary,
    candidates,
    notes: String(raw.notes ?? '').slice(0, 1000),
  };
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

function collectText(blocks: ClaudeContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => String(b.text))
    .join('\n')
    .trim();
}

export async function identifyContent(input: IdentifyInput): Promise<IdentifyResult> {
  const trimmed = input.context.slice(0, 30_000);
  const userBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  > = [];
  if (input.frames && input.frames.length > 0) {
    userBlocks.push({
      type: 'text',
      text: `Below are ${input.frames.length} sampled frames from the video, in chronological order. Read all visible UI/code/text in them — they often contain the canonical link or product name even when the audio does not.`,
    });
    input.frames.forEach((f, i) => {
      userBlocks.push({ type: 'text', text: `Frame ${i + 1}:` });
      userBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: f.mediaType, data: f.data },
      });
    });
  }
  userBlocks.push({
    type: 'text',
    text: `Saved item context:\n${trimmed || '(empty)'}\n\nIdentify the specific product, repository, paper, or app being discussed and return the JSON.`,
  });

  // The web_search server tool is supported by the Anthropic API but the
  // exact field is not in this SDK version's typed surface. Pass it through
  // as a typed-loose value — the API accepts the JSON shape verbatim.
  const tools = input.enableWebSearch !== false
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as unknown as never]
    : undefined;

  try {
    const resp = await getClaude().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: IDENTIFY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userBlocks as never }],
      ...(tools ? { tools } : {}),
    });
    const text = collectText(resp.content as unknown as ClaudeContentBlock[]);
    if (!text) throw new ClaudeError('NO_TEXT_RESPONSE', 'Claude returned no text block');
    return parseIdentifyJson(text);
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // If web_search is rejected by the API for any reason, retry once without it.
    if (tools && /tool|web_search/i.test(msg)) {
      try {
        const resp = await getClaude().messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: IDENTIFY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userBlocks as never }],
        });
        const text = collectText(resp.content as unknown as ClaudeContentBlock[]);
        if (!text) throw new ClaudeError('NO_TEXT_RESPONSE', 'Claude returned no text block');
        return parseIdentifyJson(text);
      } catch (retryErr) {
        if (retryErr instanceof ClaudeError) throw retryErr;
        const m = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new ClaudeError('IDENTIFY_FAILED', m);
      }
    }
    throw new ClaudeError('IDENTIFY_FAILED', msg);
  }
}

/**
 * Generate a 1536-dim embedding for text.
 * Uses OpenAI's text-embedding-3-small when OPENAI_API_KEY is set.
 * Falls back to a deterministic hash-based pseudo-embedding otherwise — sufficient
 * for dev/test, should never ship to production.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000);
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: trimmed }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new ClaudeError('EMBEDDING_FAILED', `openai ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      const vec = json.data[0]?.embedding;
      if (!vec || vec.length !== EMBEDDING_DIMS) {
        throw new ClaudeError('EMBEDDING_FAILED', `unexpected vector length ${vec?.length ?? 0}`);
      }
      return vec;
    } catch (err) {
      if (err instanceof ClaudeError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ClaudeError('EMBEDDING_FAILED', msg);
    }
  }

  // Deterministic fallback — not semantically meaningful, but matches shape.
  return fallbackEmbedding(trimmed);
}

function fallbackEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
  const bytes = new TextEncoder().encode(text || 'empty');
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const idx = (byte * 2654435761 + i) % EMBEDDING_DIMS;
    vec[idx] = (vec[idx] ?? 0) + (byte / 255);
  }
  // l2 normalize so cosine sim behaves sensibly
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
