import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateItemMock = vi.fn();
const getItemMock = vi.fn();
const createSaveEventMock = vi.fn();

const recordElementSaveMock = vi.fn();
const recordUserInterestsMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  getItem: (...args: unknown[]) => getItemMock(...args),
  createSaveEvent: (...args: unknown[]) => createSaveEventMock(...args),
}));

vi.mock('../../worker/src/lib/elements.js', () => ({
  recordElementSave: (...args: unknown[]) => recordElementSaveMock(...args),
  computeElementIdentity: (item: { type: string; raw_url?: string }) =>
    item.type === 'url' && item.raw_url
      ? { hash: 'fake_hash', kind: 'url' as const, normalized_url: item.raw_url }
      : null,
}));

vi.mock('../../worker/src/lib/profiler.js', () => ({
  recordUserInterests: (...args: unknown[]) => recordUserInterestsMock(...args),
}));

const { finalizeItem } = await import('../../worker/src/lib/finalize.js');

function readyItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'item_1',
    user: 'u1',
    type: 'url' as const,
    raw_url: 'https://example.com/x',
    status: 'ready' as const,
    tags: ['a'],
    category: 'dev',
    created: '',
    updated: '',
    ...over,
  };
}

describe('finalizeItem', () => {
  beforeEach(() => {
    updateItemMock.mockReset().mockResolvedValue({});
    getItemMock.mockReset();
    createSaveEventMock.mockReset();
    recordElementSaveMock.mockReset().mockResolvedValue({});
    recordUserInterestsMock.mockReset().mockResolvedValue(0);
  });

  it('sets status=ready and runs analytics on first finalize', async () => {
    getItemMock.mockResolvedValue(readyItem());
    createSaveEventMock.mockResolvedValue({ id: 'se_1' });

    await finalizeItem('item_1', { title: 't', summary: 's' });

    expect(updateItemMock).toHaveBeenCalledWith('item_1', expect.objectContaining({
      title: 't',
      summary: 's',
      status: 'ready',
    }));
    expect(createSaveEventMock).toHaveBeenCalledWith(expect.objectContaining({
      item: 'item_1',
      user: 'u1',
    }));
    expect(recordElementSaveMock).toHaveBeenCalledTimes(1);
    expect(recordUserInterestsMock).toHaveBeenCalledTimes(1);
  });

  it('skips analytics when save_events claim fails with unique violation (reprocess)', async () => {
    getItemMock.mockResolvedValue(readyItem());
    createSaveEventMock.mockRejectedValue(Object.assign(new Error('validation'), {
      status: 400,
      data: { data: { item: { code: 'validation_not_unique' } } },
    }));

    await finalizeItem('item_1', { title: 't' });

    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(recordElementSaveMock).not.toHaveBeenCalled();
    expect(recordUserInterestsMock).not.toHaveBeenCalled();
  });

  it('skips elements branch for items without url identity', async () => {
    getItemMock.mockResolvedValue(readyItem({ type: 'screenshot', raw_url: undefined }));
    createSaveEventMock.mockResolvedValue({ id: 'se_2' });

    await finalizeItem('item_1', { title: 't' });

    expect(recordElementSaveMock).not.toHaveBeenCalled();
    expect(recordUserInterestsMock).toHaveBeenCalledTimes(1);
  });

  it('analytics errors do not throw', async () => {
    getItemMock.mockResolvedValue(readyItem());
    createSaveEventMock.mockResolvedValue({ id: 'se_3' });
    recordElementSaveMock.mockRejectedValue(new Error('element boom'));
    recordUserInterestsMock.mockRejectedValue(new Error('profiler boom'));

    await expect(finalizeItem('item_1', {})).resolves.toBeUndefined();
    expect(updateItemMock).toHaveBeenCalledTimes(1);
  });

  it('getItem failure does not throw or break updateItem', async () => {
    getItemMock.mockRejectedValue(new Error('pb down'));
    await expect(finalizeItem('item_1', { title: 't' })).resolves.toBeUndefined();
    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(recordElementSaveMock).not.toHaveBeenCalled();
    expect(recordUserInterestsMock).not.toHaveBeenCalled();
  });
});
