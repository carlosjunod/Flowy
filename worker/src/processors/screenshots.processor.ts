import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { analyzeImages, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import { ProcessorError } from './url.processor.js';

type Base64MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export const MAX_SCREENSHOTS = 10;

function sniffMediaType(buffer: Buffer): Base64MediaType {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
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

function extFor(mt: Base64MediaType): string {
  const suffix = mt.split('/')[1];
  return suffix === 'jpeg' ? 'jpg' : suffix ?? 'jpg';
}

export async function processScreenshots(item: ItemRecord, rawImagesBase64: string[]): Promise<void> {
  if (!rawImagesBase64 || rawImagesBase64.length === 0) {
    throw new ProcessorError('MISSING_IMAGE');
  }

  const limited = rawImagesBase64.slice(0, MAX_SCREENSHOTS);

  const decoded: { buffer: Buffer; mediaType: Base64MediaType; cleanBase64: string }[] = [];
  for (let i = 0; i < limited.length; i++) {
    const clean = stripDataUrl(limited[i]!);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(clean, 'base64');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProcessorError('INVALID_IMAGE', `slide ${i}: ${msg}`);
    }
    if (buffer.length === 0) {
      throw new ProcessorError('INVALID_IMAGE', `slide ${i}: empty buffer`);
    }
    decoded.push({ buffer, mediaType: sniffMediaType(buffer), cleanBase64: clean });
  }

  const slides: MediaSlide[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const { buffer, mediaType } = decoded[i]!;
    const r2Key = `screenshots/${item.id}/${i}.${extFor(mediaType)}`;
    try {
      await uploadFile(r2Key, buffer, mediaType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProcessorError('R2_UPLOAD_FAILED', `slide ${i}: ${msg}`);
    }
    slides.push({ index: i, kind: 'image', r2_key: r2Key });
  }

  let vision;
  try {
    vision = await analyzeImages(
      decoded.map((d) => ({ mediaType: d.mediaType, data: d.cleanBase64 })),
    );
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  for (let i = 0; i < slides.length; i++) {
    const per = vision.per_image[i];
    if (per) {
      slides[i]!.summary = per.summary || undefined;
      slides[i]!.extracted_text = per.extracted_text || undefined;
    }
  }

  const noteSuffix =
    vision.coherence === 'unrelated' && vision.coherence_note
      ? `\n\n⚠️ ${vision.coherence_note}`
      : '';
  const summary = (vision.summary + noteSuffix).slice(0, 500);

  const composed = slides
    .map((s) => {
      const parts = [`Image ${s.index + 1}`];
      if (s.summary) parts.push(s.summary);
      if (s.extracted_text) parts.push(`Text: ${s.extracted_text}`);
      return parts.join(' — ');
    })
    .join('\n\n');

  const content = (vision.extracted_text || composed).slice(0, 40_000);

  let vector: number[];
  try {
    vector = await generateEmbedding(`${vision.title} ${vision.summary} ${vision.extracted_text}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  await finalizeItem(item.id, {
    title: vision.title,
    summary,
    content,
    tags: vision.tags,
    category: vision.category,
    r2_key: slides[0]?.r2_key,
    media: slides,
  });

  await createEmbedding(item.id, vector);
}
