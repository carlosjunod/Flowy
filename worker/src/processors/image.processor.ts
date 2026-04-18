import { updateItem, createEmbedding, type ItemRecord } from '../lib/pocketbase.js';
import { analyzeImage, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { ProcessorError } from './url.processor.js';

type Base64MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function sniffMediaType(buffer: Buffer): Base64MediaType {
  // PNG 89 50 4E 47
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF 47 49 46
  if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function stripDataUrl(input: string): string {
  const comma = input.indexOf(',');
  if (input.startsWith('data:') && comma !== -1) return input.slice(comma + 1);
  return input;
}

export async function processImage(item: ItemRecord, rawImageBase64: string): Promise<void> {
  if (!rawImageBase64) throw new ProcessorError('MISSING_IMAGE');

  const clean = stripDataUrl(rawImageBase64);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(clean, 'base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('INVALID_IMAGE', msg);
  }
  if (buffer.length === 0) throw new ProcessorError('INVALID_IMAGE', 'empty image buffer');

  const mediaType = sniffMediaType(buffer);
  const ext = mediaType.split('/')[1] ?? 'jpg';
  const r2Key = `images/${item.id}.${ext === 'jpeg' ? 'jpg' : ext}`;

  // Upload first — Vision model needs the image reachable via R2 in real production,
  // but here we pass base64 inline for determinism. Upload still serves the inbox thumbnail.
  try {
    await uploadFile(r2Key, buffer, mediaType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('R2_UPLOAD_FAILED', msg);
  }

  let vision;
  try {
    vision = await analyzeImage({ mediaType, data: clean });
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  let vector: number[];
  try {
    vector = await generateEmbedding(`${vision.extracted_text} ${vision.summary}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  await updateItem(item.id, {
    title: vision.title,
    summary: vision.summary,
    content: vision.extracted_text,
    tags: vision.tags,
    category: vision.category,
    r2_key: r2Key,
    status: 'ready',
  });

  await createEmbedding(item.id, vector);
}
