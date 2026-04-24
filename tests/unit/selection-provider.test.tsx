import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePathnameMock = vi.fn().mockReturnValue('/inbox');
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }));

const { SelectionProvider, useSelection } = await import('../../apps/web/components/inbox/SelectionProvider');

function wrapper({ children }: { children: ReactNode }) {
  return <SelectionProvider>{children}</SelectionProvider>;
}

describe('SelectionProvider', () => {
  it('starts in mode=false with empty selection', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current.mode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('enter() flips mode to true', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.enter(); });
    expect(result.current.mode).toBe(true);
  });

  it('toggle adds then removes ids', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.toggle('i1'); });
    expect(result.current.selectedIds.has('i1')).toBe(true);
    act(() => { result.current.toggle('i1'); });
    expect(result.current.selectedIds.has('i1')).toBe(false);
  });

  it('selectAll populates and clear empties', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.selectAll(['a', 'b', 'c']); });
    expect(result.current.selectedIds.size).toBe(3);
    act(() => { result.current.clear(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('exit() flips mode off and clears selection', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.enter(); result.current.toggle('i1'); });
    act(() => { result.current.exit(); });
    expect(result.current.mode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});
