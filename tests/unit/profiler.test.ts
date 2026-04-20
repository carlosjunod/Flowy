import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  findUserInterest: (...args: unknown[]) => findMock(...args),
  createUserInterest: (...args: unknown[]) => createMock(...args),
  updateUserInterest: (...args: unknown[]) => updateMock(...args),
}));

const { normalizeTopic, collectTopics, recordUserInterests } = await import(
  '../../worker/src/lib/profiler.js'
);

describe('normalizeTopic', () => {
  it('trims + lowercases', () => {
    expect(normalizeTopic('  Graphic DESIGN ')).toBe('graphic design');
  });

  it('rejects empty', () => {
    expect(normalizeTopic('')).toBeNull();
    expect(normalizeTopic('   ')).toBeNull();
  });

  it('rejects over 64 chars', () => {
    expect(normalizeTopic('x'.repeat(65))).toBeNull();
    expect(normalizeTopic('x'.repeat(64))).toBe('x'.repeat(64));
  });
});

describe('collectTopics', () => {
  it('returns tags + category with correct source labels', () => {
    const topics = collectTopics({ tags: ['streetwear', 'denim'], category: 'fashion' });
    expect(topics).toEqual([
      { topic: 'streetwear', source: 'tag' },
      { topic: 'denim', source: 'tag' },
      { topic: 'fashion', source: 'category' },
    ]);
  });

  it('dedupes repeated tags', () => {
    const topics = collectTopics({ tags: ['Coffee', 'coffee', 'COFFEE'], category: undefined });
    expect(topics).toEqual([{ topic: 'coffee', source: 'tag' }]);
  });

  it('allows tag and category with same value (different sources)', () => {
    const topics = collectTopics({ tags: ['fashion'], category: 'fashion' });
    expect(topics).toEqual([
      { topic: 'fashion', source: 'tag' },
      { topic: 'fashion', source: 'category' },
    ]);
  });

  it('skips empty and oversized entries', () => {
    const topics = collectTopics({ tags: ['', 'x'.repeat(65), 'ok'], category: '' });
    expect(topics).toEqual([{ topic: 'ok', source: 'tag' }]);
  });

  it('handles missing tags/category', () => {
    expect(collectTopics({ tags: undefined, category: undefined })).toEqual([]);
    expect(collectTopics({ tags: [], category: 'design' })).toEqual([
      { topic: 'design', source: 'category' },
    ]);
  });
});

describe('recordUserInterests', () => {
  beforeEach(() => {
    findMock.mockReset();
    createMock.mockReset().mockResolvedValue({});
    updateMock.mockReset().mockResolvedValue({});
  });

  it('creates new rows for unseen topics', async () => {
    findMock.mockResolvedValue(null);
    const written = await recordUserInterests({
      user: 'u1',
      tags: ['streetwear', 'denim'],
      category: 'fashion',
    });
    expect(written).toBe(3);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls.map((c) => c[0].topic)).toEqual(['streetwear', 'denim', 'fashion']);
    for (const call of createMock.mock.calls) {
      expect(call[0].count).toBe(1);
      expect(call[0].user).toBe('u1');
    }
  });

  it('increments existing rows by 1', async () => {
    findMock.mockResolvedValue({ id: 'int_1', count: 9 });
    const written = await recordUserInterests({ user: 'u1', tags: ['fashion'], category: undefined });
    expect(written).toBe(1);
    expect(updateMock).toHaveBeenCalledWith('int_1', expect.objectContaining({ count: 10 }));
    expect(createMock).not.toHaveBeenCalled();
  });

  it('is a no-op with empty tags and no category', async () => {
    const written = await recordUserInterests({ user: 'u1', tags: [], category: undefined });
    expect(written).toBe(0);
    expect(findMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('is a no-op when user is missing', async () => {
    const written = await recordUserInterests({ user: '', tags: ['x'], category: 'y' });
    expect(written).toBe(0);
  });

  it('continues when one topic upsert fails', async () => {
    findMock
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(null);
    const written = await recordUserInterests({
      user: 'u1',
      tags: ['a', 'b'],
      category: 'c',
    });
    expect(written).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
