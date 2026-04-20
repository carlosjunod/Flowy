import { updateItem, createEmbedding, type ItemRecord } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { YoutubeTranscript } from '../lib/youtubeTranscriptLoader.js';
import { ProcessorError } from './url.processor.js';

const ID_PATTERNS: RegExp[] = [
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
];

export function extractVideoId(url: string): string | null {
  for (const re of ID_PATTERNS) {
    const m = url.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

interface OembedResponse {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
}

async function fetchOembed(rawUrl: string): Promise<OembedResponse | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`);
    if (!res.ok) return null;
    return (await res.json()) as OembedResponse;
  } catch {
    return null;
  }
}

export async function processYoutube(item: ItemRecord): Promise<void> {
  const url = item.raw_url;
  if (!url) throw new ProcessorError('MISSING_URL');

  const videoId = extractVideoId(url);
  if (!videoId) throw new ProcessorError('INVALID_YOUTUBE_URL', `could not extract id from ${url}`);

  let contentForClaude: string;
  let fallbackTitle: string | undefined;

  try {
    const chunks = await YoutubeTranscript.fetchTranscript(videoId);
    const joined = chunks.map((c) => c.text).join(' ').trim();
    if (!joined) {
      throw new Error('empty transcript');
    }
    contentForClaude = joined.slice(0, 50_000);
  } catch {
    const meta = await fetchOembed(url);
    if (meta) {
      fallbackTitle = meta.title;
      contentForClaude =
        `[transcript unavailable] ${meta.title ?? ''}\n` +
        `by ${meta.author_name ?? 'unknown'} on ${meta.provider_name ?? 'YouTube'}`;
    } else {
      contentForClaude = `[transcript unavailable]\nURL: ${url}`;
    }
  }

  let structured;
  try {
    structured = await extractStructuredData(contentForClaude);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  let vector: number[];
  try {
    vector = await generateEmbedding(`${structured.summary} ${structured.tags.join(' ')}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  await updateItem(item.id, {
    title: structured.title || fallbackTitle || `YouTube video ${videoId}`,
    summary: structured.summary,
    content: contentForClaude.slice(0, 20_000),
    tags: structured.tags,
    category: structured.category,
    source_url: url,
    status: 'ready',
  });

  await createEmbedding(item.id, vector);
}
