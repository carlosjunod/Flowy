'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '@/types';
import { ItemDrawer } from './ItemDrawer';

export type ItemMutation =
  | { kind: 'updated'; item: Item }
  | { kind: 'deleted'; id: string }
  | { kind: 'retried'; item: Item }
  | { kind: 'created'; item: Item }
  | { kind: 'bulk-deleted'; ids: string[] }
  | { kind: 'bulk-retried'; ids: string[] };

type Listener = (m: ItemMutation) => void;

interface DrawerApi {
  open: (id: string) => void;
  close: () => void;
  subscribe: (listener: Listener) => () => void;
  emit: (m: ItemMutation) => void;
}

const DrawerContext = createContext<DrawerApi | null>(null);

export function useItemDrawer(): DrawerApi {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useItemDrawer must be used within <ItemDrawerProvider>');
  return ctx;
}

export function ItemDrawerProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());

  const api = useMemo<DrawerApi>(() => ({
    open: (id: string) => setOpenId(id),
    close: () => setOpenId(null),
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => { listenersRef.current.delete(listener); };
    },
    emit: (m: ItemMutation) => {
      for (const l of listenersRef.current) l(m);
    },
  }), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null);
    }
    if (openId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  return (
    <DrawerContext.Provider value={api}>
      {children}
      {openId ? (
        <ItemDrawer
          itemId={openId}
          onClose={() => setOpenId(null)}
          onUpdated={(item) => api.emit({ kind: 'updated', item })}
          onDeleted={(id) => {
            api.emit({ kind: 'deleted', id });
            setOpenId(null);
          }}
        />
      ) : null}
    </DrawerContext.Provider>
  );
}
