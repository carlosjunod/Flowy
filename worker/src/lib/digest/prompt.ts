import type { ItemRecord } from '../pocketbase.js';
import { itemImageUrl } from './grouper.js';

export interface PromptPayload {
  system: string;
  user: string;
  availableImageUrls: string[];
}

export const DIGEST_SYSTEM_PROMPT = `You are the editor of a personal daily digest — a short newsletter that recaps what the reader saved over the last 24 hours in a single category.

Tone:
- Informative, warm, and newsletter-friendly. Speak to the reader in second person ("you saved", "you're tracking"), not like a system log.
- Connect the items into a narrative when possible. Call out trends, through-lines, and standout pieces.
- Medium detail: 2 to 4 short paragraphs, roughly 120–220 words total. Not a list, not a single sentence.
- Never fabricate facts. Only use what the items provide.

Output format:
Respond with ONLY a single JSON object — no prose, no code fences — matching this exact shape:

{
  "category": string,            // echo back the category you were given
  "summary": string,              // the newsletter-style recap described above
  "image_urls": string[]          // 0–3 URLs picked verbatim from the "available_image_urls" list, representing this category. Do not invent URLs.
}`;

function truncate(value: string | undefined, max: number): string {
  const s = (value ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function buildCategoryPrompt(category: string, items: ItemRecord[]): PromptPayload {
  const availableImageUrls: string[] = [];
  const lines = items.map((item, idx) => {
    const image = itemImageUrl(item);
    if (image && !availableImageUrls.includes(image)) availableImageUrls.push(image);
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 5).join(', ') : '';
    return [
      `Item ${idx + 1} (id=${item.id}, type=${item.type}):`,
      `  title: ${truncate(item.title, 160)}`,
      `  source_url: ${item.source_url ?? item.raw_url ?? ''}`,
      `  tags: ${tags}`,
      `  summary: ${truncate(item.summary, 400)}`,
      `  content_excerpt: ${truncate(item.content, 800)}`,
      image ? `  image_url: ${image}` : '  image_url: (none)',
    ].join('\n');
  });

  const user = [
    `Category: ${category}`,
    `Item count: ${items.length}`,
    '',
    'available_image_urls:',
    availableImageUrls.length === 0 ? '  (none)' : availableImageUrls.map((u) => `  - ${u}`).join('\n'),
    '',
    'items:',
    lines.join('\n\n'),
    '',
    'Write the digest entry for this category now as the JSON object specified.',
  ].join('\n');

  return { system: DIGEST_SYSTEM_PROMPT, user, availableImageUrls };
}
