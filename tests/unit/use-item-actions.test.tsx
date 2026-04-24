import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const openMock = vi.fn();
const emitMock = vi.fn();
const subscribeMock = vi.fn().mockReturnValue(() => undefined);

vi.mock('@/components/inbox/ItemDrawerProvider', () => ({
  useItemDrawer: () => ({ open: openMock, close: vi.fn(), emit: emitMock, subscribe: subscribeMock }),
}));

const deleteItemMock = vi.fn();
const retryItemMock = vi.fn();
const deleteItemsMock = vi.fn();
const reloadItemsMock = vi.fn();

vi.mock('@/lib/items-actions', () => ({
  deleteItem: (id: string) => deleteItemMock(id),
  retryItem: (id: string) => retryItemMock(id),
  deleteItems: (ids: string[]) => deleteItemsMock(ids),
  reloadItems: (ids: string[]) => reloadItemsMock(ids),
}));

const confirmSpy = vi.spyOn(globalThis, 'confirm' as never);

const { useItemActions } = await import('../../apps/web/lib/hooks/useItemActions');

function wrapper({ children }: { children: ReactNode }) {
  return children as unknown as JSX.Element;
}

beforeEach(() => {
  openMock.mockReset();
  emitMock.mockReset();
  deleteItemMock.mockReset();
  retryItemMock.mockReset();
  deleteItemsMock.mockReset();
  reloadItemsMock.mockReset();
  confirmSpy.mockReset();
});

describe('useItemActions', () => {
  it('openItem delegates to drawer.open', () => {
    const { result } = renderHook(() => useItemActions(), { wrapper });
    act(() => { result.current.openItem('i1'); });
    expect(openMock).toHaveBeenCalledWith('i1');
  });

  it('reloadItem calls retryItem and emits retried on success', async () => {
    retryItemMock.mockResolvedValue({ ok: true, data: { id: 'i1', status: 'pending' } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.reloadItem('i1'); });
    expect(retryItemMock).toHaveBeenCalledWith('i1');
    expect(emitMock).toHaveBeenCalledWith({ kind: 'retried', item: { id: 'i1', status: 'pending' } });
  });

  it('deleteItem (single) does not trigger confirm dialog', async () => {
    deleteItemMock.mockResolvedValue({ ok: true, data: { id: 'i1' } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteItem('i1'); });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith({ kind: 'deleted', id: 'i1' });
  });

  it('deleteMany confirms and emits bulk-deleted on success', async () => {
    confirmSpy.mockReturnValue(true);
    deleteItemsMock.mockResolvedValue({ ok: true, data: { succeeded: ['i1', 'i2'], failed: [] } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteMany(['i1', 'i2']); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith({ kind: 'bulk-deleted', ids: ['i1', 'i2'] });
  });

  it('deleteMany aborts when confirm is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteMany(['i1']); });
    expect(deleteItemsMock).not.toHaveBeenCalled();
  });

  it('reloadMany emits bulk-retried with only succeeded ids', async () => {
    reloadItemsMock.mockResolvedValue({
      ok: true,
      data: { succeeded: ['i1'], failed: [{ id: 'i2', code: 'ALREADY_PROCESSING' }] },
    });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.reloadMany(['i1', 'i2']); });
    expect(emitMock).toHaveBeenCalledWith({ kind: 'bulk-retried', ids: ['i1'] });
  });
});
