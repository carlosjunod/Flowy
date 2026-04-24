import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { finalizeItem } from '../lib/finalize.js';
import {
  fetchHtml,
  parseOgMetadata,
  processHeroImage,
  resolveImageUrl,
} from '../lib/social.js';
import { isLinkedinUrl } from '../lib/socialUrls.js';
import { ProcessorError } from './url.processor.js';

export { isLinkedinUrl };

const CONTENT_CAP = 20_000;

async function resolveShortUrl(rawUrl: string): Promise<string> {
  if (!/^https?:\/\/lnkd\.in\//i.test(rawUrl)) return rawUrl;
  try {
    const res = await fetch(rawUrl, { method: 'GET', redirect: 'follow' });
    return res.url || rawUrl;
  } catch {
    return rawUrl;
  }
}

function composeContent(meta: {
  title?: string;
  description?: string;
  siteName?: string;
}, slide?: MediaSlide): string {
  const parts: string[] = [];
  if (meta.title) parts.push(meta.title);
  if (meta.description) parts.push(meta.description);
  if (slide?.summary) parts.push(`Image: ${slide.summary}`);
  if (slide?.extracted_text) parts.push(`Text in image: ${slide.extracted_text}`);
  return parts.join('\n\n');
}

export async function processLinkedin(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isLinkedinUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_LINKEDIN_URL', rawUrl);

  const resolvedUrl = await resolveShortUrl(rawUrl);

  // LinkedIn blocks almost all scraping without auth — OG tags are usually still
  // served for posts/pulse articles because they're needed for link previews.
  let html: string;
  try {
    html = await fetchHtml(resolvedUrl);
  } catch (err) {
    if (err instanceof ProcessorError && err.code === 'FETCH_FAILED') {
      throw new ProcessorError('LINKEDIN_BLOCKED', err.message);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('FETCH_FAILED', msg);
  }

  const meta = parseOgMetadata(html);
  if (!meta.title && !meta.description) {
    throw new ProcessorError('LINKEDIN_PARSE_FAILED', 'no metadata found (likely auth wall)');
  }

  let slide: MediaSlide | undefined;
  if (meta.image) {
    try {
      const imageUrl = resolveImageUrl(meta.image, resolvedUrl);
      const hero = await processHeroImage(item.id, 'linkedin', imageUrl, resolvedUrl, resolvedUrl);
      slide = hero.slide;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[linkedin] hero image failed: ${msg}`);
    }
  }

  const content = composeContent(meta, slide);

  let structured;
  try {
    structured = await extractStructuredData(content || meta.title || resolvedUrl);
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
    title: structured.title || meta.title || 'LinkedIn post',
    summary: structured.summary,
    content: content.slice(0, CONTENT_CAP),
    tags: structured.tags,
    category: structured.category,
    source_url: resolvedUrl,
    og_image: meta.image ?? '',
    og_description: meta.description?.slice(0, 500) ?? '',
    site_name: meta.siteName?.slice(0, 100) ?? 'LinkedIn',
    ...(slide ? { media: [slide], r2_key: slide.r2_key } : {}),
  });

  await createEmbedding(item.id, vector);
}
