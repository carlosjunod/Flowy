import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { finalizeItem } from '../lib/finalize.js';
import {
  fetchHtml,
  parseOgMetadata,
  processHeroImage,
  resolveImageUrl,
} from '../lib/social.js';
import { isDribbbleUrl } from '../lib/socialUrls.js';
import { ProcessorError } from './url.processor.js';

export { isDribbbleUrl };

const CONTENT_CAP = 20_000;

function extractShotTags(html: string): string[] {
  const tags: string[] = [];
  const re = /<a[^>]+href=["']\/tags\/([^"'\/]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
}

function extractDesignerName(html: string): string | undefined {
  const m = html.match(/<a[^>]+class=["'][^"']*user-information[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  if (m && m[1]) {
    const stripped = m[1].replace(/<[^>]+>/g, '').trim();
    if (stripped) return stripped;
  }
  const og = html.match(/<meta[^>]+property=["']article:author["'][^>]*content=["']([^"']+)["']/i);
  return og?.[1]?.trim();
}

function composeContent(meta: {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}, designer: string | undefined, tags: string[], slide?: MediaSlide): string {
  const parts: string[] = [];
  if (meta.title) parts.push(meta.title);
  if (designer) parts.push(`By ${designer}`);
  if (meta.description) parts.push(meta.description);
  if (slide?.summary) parts.push(`Shot: ${slide.summary}`);
  if (slide?.extracted_text) parts.push(`Text in shot: ${slide.extracted_text}`);
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join('\n\n');
}

export async function processDribbble(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isDribbbleUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_DRIBBBLE_URL', rawUrl);

  let html: string;
  try {
    html = await fetchHtml(rawUrl);
  } catch (err) {
    if (err instanceof ProcessorError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('FETCH_FAILED', msg);
  }

  const meta = parseOgMetadata(html);
  if (!meta.title && !meta.image) {
    throw new ProcessorError('DRIBBBLE_PARSE_FAILED', 'no metadata found');
  }

  const designer = extractDesignerName(html);
  const pageTags = extractShotTags(html);

  let slide: MediaSlide | undefined;
  if (meta.image) {
    try {
      const imageUrl = resolveImageUrl(meta.image, rawUrl);
      const hero = await processHeroImage(item.id, 'dribbble', imageUrl, rawUrl, rawUrl);
      slide = hero.slide;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[dribbble] hero image failed: ${msg}`);
    }
  }

  const content = composeContent(meta, designer, pageTags, slide);

  let structured;
  try {
    structured = await extractStructuredData(content || meta.title || rawUrl);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  // Merge Claude-derived tags with dribbble page tags, max 5.
  const mergedTags = Array.from(new Set([...structured.tags, ...pageTags])).slice(0, 5);

  let vector: number[];
  try {
    vector = await generateEmbedding(`${structured.summary} ${mergedTags.join(' ')}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  await finalizeItem(item.id, {
    title: structured.title || meta.title || 'Dribbble shot',
    summary: structured.summary,
    content: content.slice(0, CONTENT_CAP),
    tags: mergedTags,
    category: structured.category || 'design',
    source_url: rawUrl,
    og_image: meta.image ?? '',
    og_description: meta.description?.slice(0, 500) ?? '',
    site_name: designer ? `Dribbble · ${designer}` : 'Dribbble',
    ...(slide ? { media: [slide], r2_key: slide.r2_key } : {}),
  });

  await createEmbedding(item.id, vector);
}
