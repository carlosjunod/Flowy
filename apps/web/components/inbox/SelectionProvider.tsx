'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

interface SelectionApi {
  mode: boolean;
  selectedIds: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  enter: () => void;
  exit: () => void;
}

const SelectionContext = createContext<SelectionApi | null>(null);

export function useSelection(): SelectionApi {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within <SelectionProvider>');
  return ctx;
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => { setSelectedIds(new Set(ids)); }, []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const enter = useCallback(() => setMode(true), []);
  const exit = useCallback(() => { setMode(false); setSelectedIds(new Set()); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mode) exit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, exit]);

  useEffect(() => {
    exit();
  }, [pathname, exit]);

  const api = useMemo<SelectionApi>(() => ({ mode, selectedIds, toggle, selectAll, clear, enter, exit }),
    [mode, selectedIds, toggle, selectAll, clear, enter, exit]);

  return <SelectionContext.Provider value={api}>{children}</SelectionContext.Provider>;
}
