import 'dotenv/config';

import { createEmbedding, type ItemRecord } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import { transcribeMediaUrl } from '../lib/transcription.js';
import { ProcessorError } from './url.processor.js';

const TIKTOK_PATTERNS = [
  /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
  /^https?:\/\/vm\.tiktok\.com\//,
];
const INSTAGRAM_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
];

export type VideoPlatform = 'tiktok' | 'instagram';

export function detectPlatform(url: string): VideoPlatform | null {
  if (TIKTOK_PATTERNS.some((r) => r.test(url))) return 'tiktok';
  if (INSTAGRAM_PATTERNS.some((r) => r.test(url))) return 'instagram';
  return null;
}

export async function processVideo(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');

  const platform = detectPlatform(rawUrl);
  if (!platform) throw new ProcessorError('UNSUPPORTED_VIDEO_URL', rawUrl);

  const { transcript, thumbnailBuffer } = await transcribeMediaUrl({
    url: rawUrl,
    tmpPrefix: `tryflowy-${item.id}`,
  });

  let r2Key: string | undefined;
  if (thumbnailBuffer) {
    try {
      r2Key = `thumbnails/${item.id}.jpg`;
      await uploadFile(r2Key, thumbnailBuffer, 'image/jpeg');
    } catch (err) {
      console.warn(`[video] thumbnail upload failed: ${err instanceof Error ? err.message : String(err)}`);
      r2Key = undefined;
    }
  }

  let structured;
  try {
    structured = await extractStructuredData(transcript || '[no transcript]');
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

  const patch: Partial<ItemRecord> = {
    title: structured.title,
    summary: structured.summary,
    content: transcript.slice(0, 40_000),
    tags: structured.tags,
    category: structured.category,
    source_url: rawUrl,
  };
  if (r2Key) patch.r2_key = r2Key;

  await finalizeItem(item.id, patch);
  await createEmbedding(item.id, vector);
}
