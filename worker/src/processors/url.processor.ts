import { extract } from '@extractus/article-extractor';
import { updateItem, createEmbedding, type ItemRecord } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';

export class ProcessorError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'ProcessorError';
  }
}

export async function processUrl(item: ItemRecord): Promise<void> {
  const url = item.raw_url;
  if (!url) throw new ProcessorError('MISSING_URL');

  let scraped: { title?: string; content?: string; url?: string } | null;
  try {
    scraped = await extract(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('SCRAPE_FAILED', msg);
  }
  if (!scraped || !scraped.content) {
    throw new ProcessorError('SCRAPE_FAILED', 'no content extracted');
  }

  // Strip HTML tags from content — article-extractor returns HTML
  const plainContent = stripHtml(scraped.content).trim();
  if (!plainContent) throw new ProcessorError('SCRAPE_FAILED', 'empty content after strip');

  let structured;
  try {
    structured = await extractStructuredData(plainContent);
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

  const finalTitle = structured.title || scraped.title || url;

  await updateItem(item.id, {
    title: finalTitle,
    summary: structured.summary,
    content: plainContent.slice(0, 20_000),
    tags: structured.tags,
    category: structured.category,
    source_url: scraped.url ?? url,
    status: 'ready',
  });

  await createEmbedding(item.id, vector);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
