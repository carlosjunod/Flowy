import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { finalizeItem } from '../lib/finalize.js';
import {
  fetchHtml,
  parseOgMetadata,
  processHeroImage,
  resolveImageUrl,
} from '../lib/social.js';
import { isPinterestUrl } from '../lib/socialUrls.js';
import { ProcessorError } from './url.processor.js';

export { isPinterestUrl };

const CONTENT_CAP = 20_000;

function composeContent(meta: {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}, slide?: MediaSlide): string {
  const parts: string[] = [];
  if (meta.title) parts.push(meta.title);
  if (meta.description) parts.push(meta.description);
  if (slide?.summary) parts.push(`Image: ${slide.summary}`);
  if (slide?.extracted_text) parts.push(`Text in image: ${slide.extracted_text}`);
  if (meta.siteName) parts.push(`Source: ${meta.siteName}`);
  return parts.join('\n\n');
}

export async function processPinterest(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isPinterestUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_PINTEREST_URL', rawUrl);

  let html: string;
  try {
    html = await fetchHtml(rawUrl);
  } catch (err) {
    if (err instanceof ProcessorError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('FETCH_FAILED', msg);
  }

  const meta = parseOgMetadata(html);
  if (!meta.title && !meta.description && !meta.image) {
    throw new ProcessorError('PINTEREST_PARSE_FAILED', 'no metadata found');
  }

  let slide: MediaSlide | undefined;
  if (meta.image) {
    try {
      const imageUrl = resolveImageUrl(meta.image, rawUrl);
      const hero = await processHeroImage(item.id, 'pinterest', imageUrl, rawUrl, rawUrl);
      slide = hero.slide;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pinterest] hero image failed: ${msg}`);
    }
  }

  const content = composeContent(meta, slide);

  let structured;
  try {
    structured = await extractStructuredData(content || meta.title || rawUrl);
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

  await finalizeItem(item.id, {
    title: structured.title || meta.title || 'Pinterest pin',
    summary: structured.summary,
    content: content.slice(0, CONTENT_CAP),
    tags: structured.tags,
    category: structured.category,
    source_url: rawUrl,
    og_image: meta.image ?? '',
    og_description: meta.description?.slice(0, 500) ?? '',
    site_name: meta.siteName?.slice(0, 100) ?? 'Pinterest',
    ...(slide ? { media: [slide], r2_key: slide.r2_key } : {}),
  });

  await createEmbedding(item.id, vector);
}
