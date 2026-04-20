import { describe, it, expect, vi, beforeEach } from 'vitest';

const findByHashMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const updateItemMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  findGlobalElementByHash: (...args: unknown[]) => findByHashMock(...args),
  createGlobalElement: (...args: unknown[]) => createMock(...args),
  updateGlobalElement: (...args: unknown[]) => updateMock(...args),
  updateItem: (...args: unknown[]) => updateItemMock(...args),
}));

const { normalizeUrl, computeElementIdentity, recordElementSave } = await import(
  '../../worker/src/lib/elements.js'
);

describe('normalizeUrl', () => {
  it('lowercases host', () => {
    expect(normalizeUrl('https://Example.COM/path')).toBe('https://example.com/path');
  });

  it('strips fragment', () => {
    expect(normalizeUrl('https://example.com/x#section')).toBe('https://example.com/x');
  });

  it('strips utm tracking params', () => {
    expect(
      normalizeUrl('https://example.com/x?utm_source=x&utm_medium=y&keep=1'),
    ).toBe('https://example.com/x?keep=1');
  });

  it('strips fbclid/gclid/igshid/ref', () => {
    expect(
      normalizeUrl('https://example.com/x?fbclid=a&gclid=b&igshid=c&ref=d'),
    ).toBe('https://example.com/x');
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('keeps bare root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('canonicalizes youtu.be short link', () => {
    expect(normalizeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('canonicalizes youtube watch url and strips utm', () => {
    expect(
      normalizeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x'),
    ).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('canonicalizes youtube shorts', () => {
    expect(normalizeUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('rejects non-http(s) schemes', () => {
    expect(normalizeUrl('ftp://example.com/x')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

describe('computeElementIdentity', () => {
  it('returns url identity for url items', () => {
    const id = computeElementIdentity({ type: 'url', raw_url: 'https://example.com/x' });
    expect(id?.kind).toBe('url');
    expect(id?.normalized_url).toBe('https://example.com/x');
    expect(id?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns url identity for youtube items with canonical url', () => {
    const a = computeElementIdentity({ type: 'youtube', raw_url: 'https://youtu.be/dQw4w9WgXcQ' });
    const b = computeElementIdentity({
      type: 'youtube',
      raw_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x',
    });
    expect(a?.hash).toBe(b?.hash);
  });

  it('returns null for screenshot (v1 skip)', () => {
    expect(computeElementIdentity({ type: 'screenshot', raw_url: undefined })).toBeNull();
  });

  it('returns null for pdf/audio/receipt', () => {
    expect(computeElementIdentity({ type: 'pdf', raw_url: 'x' })).toBeNull();
    expect(computeElementIdentity({ type: 'audio', raw_url: 'x' })).toBeNull();
    expect(computeElementIdentity({ type: 'receipt', raw_url: 'x' })).toBeNull();
  });

  it('returns null when url is unparseable', () => {
    expect(computeElementIdentity({ type: 'url', raw_url: 'not-a-url' })).toBeNull();
  });
});

describe('recordElementSave', () => {
  beforeEach(() => {
    findByHashMock.mockReset();
    createMock.mockReset().mockImplementation(async (d) => ({ id: 'el_new', ...d }));
    updateMock.mockReset().mockImplementation(async (id, p) => ({ id, ...p }));
    updateItemMock.mockReset().mockResolvedValue({});
  });

  function baseItem(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'item_1',
      user: 'u1',
      type: 'url' as const,
      raw_url: 'https://example.com/x',
      status: 'ready' as const,
      tags: [],
      created: '',
      updated: '',
      ...over,
    };
  }

  it('creates a new global_element with save_count=1 when hash is unseen', async () => {
    findByHashMock.mockResolvedValue(null);
    const element = await recordElementSave(baseItem());
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      kind: 'url',
      save_count: 1,
      first_saved_by: 'u1',
      normalized_url: 'https://example.com/x',
    });
    expect(element?.id).toBe('el_new');
    expect(updateItemMock).toHaveBeenCalledWith('item_1', { element: 'el_new' });
  });

  it('increments save_count when element already exists', async () => {
    findByHashMock.mockResolvedValue({ id: 'el_existing', save_count: 3 });
    await recordElementSave(baseItem({ id: 'item_2', user: 'u2' }));
    expect(updateMock).toHaveBeenCalledWith('el_existing', expect.objectContaining({
      save_count: 4,
    }));
    expect(createMock).not.toHaveBeenCalled();
    expect(updateItemMock).toHaveBeenCalledWith('item_2', { element: 'el_existing' });
  });

  it('skips unsupported item types (returns null, no PB calls)', async () => {
    const result = await recordElementSave(baseItem({ type: 'screenshot', raw_url: undefined }));
    expect(result).toBeNull();
    expect(findByHashMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not re-link item when element id is already set', async () => {
    findByHashMock.mockResolvedValue({ id: 'el_same', save_count: 1 });
    await recordElementSave(baseItem({ element: 'el_same' }));
    expect(updateItemMock).not.toHaveBeenCalled();
  });
});
