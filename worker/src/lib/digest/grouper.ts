import type { ItemRecord } from '../pocketbase.js';
import type { GroupedItems } from './types.js';

const UNCATEGORIZED = 'uncategorized';

function normalizeCategory(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().toLowerCase();
  return trimmed.length === 0 ? UNCATEGORIZED : trimmed;
}

export function groupByCategory(items: ItemRecord[]): GroupedItems {
  const groups: GroupedItems = new Map();
  for (const item of items) {
    const key = normalizeCategory(item.category);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

export function itemImageUrl(item: ItemRecord): string | undefined {
  if (item.r2_key && R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${item.r2_key}`;
  if (Array.isArray(item.media) && item.media.length > 0) {
    const first = item.media.find((m) => m.kind === 'image');
    if (first?.r2_key && R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${first.r2_key}`;
  }
  if (item.og_image) return item.og_image;
  return undefined;
}
