'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportBatch } from '@/types';
import { XIcon } from '@/components/ui/icons';

const STORAGE_KEY = 'flowy:active-import-batch';
const DISMISS_KEY_PREFIX = 'flowy:dismissed-batch:';
const POLL_INTERVAL_MS = 5000;

interface Props {
  /**
   * When the parent (ImportBookmarksButton) starts an import, it calls
   * setActiveBatch with the new batch id so the banner can begin polling
   * without a page reload.
   */
  activeBatchId?: string | null;
}

function loadStoredBatchId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function storeBatchId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
}

function markDismissed(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISMISS_KEY_PREFIX + id, '1');
}

function isDismissed(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DISMISS_KEY_PREFIX + id) === '1';
}

export function ImportProgressBanner({ activeBatchId }: Props) {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = loadStoredBatchId();
    if (activeBatchId) {
      setBatchId(activeBatchId);
      storeBatchId(activeBatchId);
    } else if (stored) {
      if (isDismissed(stored)) setDismissed(true);
      else setBatchId(stored);
    }
  }, [activeBatchId]);

  const fetchBatch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/import-batches/${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) {
          storeBatchId(null);
          setBatchId(null);
          setBatch(null);
        }
        return;
      }
      const body = (await res.json()) as { data?: ImportBatch };
      if (body.data) setBatch(body.data);
    } catch {
      /* transient; next poll will retry */
    }
  }, []);

  useEffect(() => {
    if (!batchId || dismissed) return;
    void fetchBatch(batchId);
    pollRef.current = window.setInterval(() => {
      void fetchBatch(batchId);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [batchId, dismissed, fetchBatch]);

  useEffect(() => {
    if (batch && batch.status !== 'running' && pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [batch]);

  const handleDismiss = useCallback(() => {
    if (batchId) markDismissed(batchId);
    setDismissed(true);
  }, [batchId]);

  if (!batchId || dismissed || !batch) return null;

  const processed = batch.completed_count + batch.dead_count + batch.failed_count;
  const isDone = batch.status !== 'running';
  const pct = batch.total > 0 ? Math.min(100, Math.round((processed / batch.total) * 100)) : 0;

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="import-progress-banner"
      className="relative mb-5 overflow-hidden rounded-xl border border-border bg-surface-elevated px-4 py-3 animate-fade-up"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1 text-muted hover:bg-foreground/5 hover:text-foreground"
      >
        <XIcon size={14} />
      </button>
      <div className="flex flex-col gap-2 pr-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            {isDone ? 'Bookmark import complete' : 'Importing bookmarks'}
          </h3>
          <span className="text-xs text-muted">
            {isDone
              ? `${batch.completed_count.toLocaleString()} of ${batch.total.toLocaleString()} imported`
              : `${processed.toLocaleString()} / ${batch.total.toLocaleString()}`}
          </span>
        </div>
        {!isDone ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted">
          {isDone ? (
            <>
              {batch.dead_count > 0
                ? `${batch.dead_count.toLocaleString()} dead link${batch.dead_count === 1 ? '' : 's'} removed. `
                : ''}
              {batch.failed_count > 0
                ? `${batch.failed_count.toLocaleString()} failed to process. `
                : ''}
              {batch.dead_count === 0 && batch.failed_count === 0 ? 'All bookmarks processed cleanly.' : ''}
            </>
          ) : (
            <>
              Dead links will be removed as they’re detected. This takes a while for large
              imports — it’s safe to leave this page.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
