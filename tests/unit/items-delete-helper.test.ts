import { describe, it, expect, vi } from 'vitest';
import { deleteItemWithCascade } from '@/lib/items-delete';

describe('deleteItemWithCascade', () => {
  function makePb(overrides: Record<string, unknown> = {}) {
    const getFullList = vi.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    const deleteEmbedding = vi.fn().mockResolvedValue(undefined);
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const getOne = vi.fn().mockResolvedValue({ id: 'i1', user: 'u1' });

    const pb = {
      filter: (template: string, vars: Record<string, unknown>) =>
        template.replace('{:id}', `"${vars.id}"`),
      collection: (name: string) => {
        if (name === 'embeddings') return { getFullList, delete: deleteEmbedding };
        if (name === 'items') return { getOne, delete: deleteItem };
        throw new Error('unknown');
      },
    } as unknown;
    return { pb, getFullList, deleteEmbedding, deleteItem, getOne, ...overrides };
  }

  it('deletes embeddings then item when owned', async () => {
    const { pb, getFullList, deleteEmbedding, deleteItem } = makePb();
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');

    expect(result.ok).toBe(true);
    expect(getFullList).toHaveBeenCalledWith({ filter: 'item = "i1"', fields: 'id' });
    expect(deleteEmbedding).toHaveBeenCalledTimes(2);
    expect(deleteItem).toHaveBeenCalledWith('i1');
  });

  it('returns ITEM_NOT_FOUND when item missing', async () => {
    const pb = {
      collection: (name: string) => ({
        getOne: vi.fn().mockRejectedValue(new Error('404')),
        getFullList: vi.fn(),
        delete: vi.fn(),
      }),
    } as unknown;
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ITEM_NOT_FOUND');
  });

  it('returns ITEM_NOT_FOUND when owned by another user', async () => {
    const pb = {
      collection: () => ({
        getOne: vi.fn().mockResolvedValue({ id: 'i1', user: 'u2' }),
        getFullList: vi.fn(),
        delete: vi.fn(),
      }),
    } as unknown;
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ITEM_NOT_FOUND');
  });
});
