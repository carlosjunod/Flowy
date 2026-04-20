import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareItem } from '../../apps/web/lib/share.ts';
import type { Item } from '../../apps/web/types/index.ts';

function baseItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    user: 'u1',
    type: 'url',
    source_url: 'https://example.com',
    tags: [],
    status: 'ready',
    created: '',
    updated: '',
    ...overrides,
  };
}

describe('shareItem', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {});
  });

  it('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    const result = await shareItem(baseItem());
    expect(result).toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Flowy item',
      url: 'https://example.com',
      text: 'Flowy item',
    });
  });

  it('falls back to clipboard when navigator.share missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const result = await shareItem(baseItem({ title: 'hello' }));
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('treats user cancellation (AbortError) as shared, not failed', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }));
    vi.stubGlobal('navigator', { share });
    const result = await shareItem(baseItem());
    expect(result).toBe('shared');
  });

  it('returns failed when item has no url', async () => {
    const result = await shareItem(baseItem({ source_url: undefined, raw_url: undefined }));
    expect(result).toBe('failed');
  });

  it('returns failed when neither share nor clipboard available', async () => {
    vi.stubGlobal('navigator', {});
    const result = await shareItem(baseItem());
    expect(result).toBe('failed');
  });

  it('prefers source_url over raw_url', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await shareItem(baseItem({ source_url: 'https://source', raw_url: 'https://raw' }));
    expect(writeText).toHaveBeenCalledWith('https://source');
  });
});
