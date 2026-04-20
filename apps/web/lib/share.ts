import type { Item } from '@/types';

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareItem(item: Item): Promise<ShareResult> {
  const url = item.source_url ?? item.raw_url ?? '';
  const title = item.title ?? 'Flowy item';
  if (!url) return 'failed';

  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, url, text: title });
      return 'shared';
    } catch (err) {
      // User cancelled — treat as non-failure, let caller stay silent.
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
      // fall through to clipboard
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
