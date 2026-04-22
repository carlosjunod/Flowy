'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ListIcon, XIcon } from '@/components/ui/icons';
import { useItemDrawer } from './ItemDrawerProvider';

const ERROR_COPY: Record<string, string> = {
  MISSING_URL: 'Missing URL',
  INVALID_TYPE: 'Invalid URL',
  UNAUTHORIZED: 'Session expired',
};

const MAX_LINKS = 100;
const CONCURRENCY = 4;

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[,;]+$/, '');
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

interface ParsedLinks {
  valid: string[];
  invalid: string[];
}

function parseInput(text: string): ParsedLinks {
  const tokens = text
    .split(/[\s,;]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const normalized = normalizeUrl(token);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    valid.push(normalized);
  }
  return { valid, invalid };
}

interface FailedLink {
  url: string;
  reason: string;
}

async function ingestOne(url: string): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'url', raw_url: url }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id: string };
      error?: string;
    };
    if (!res.ok || !body.data?.id) {
      const code = body.error ?? `HTTP_${res.status}`;
      return { error: ERROR_COPY[code] ?? code };
    }
    return { id: body.data.id };
  } catch {
    return { error: 'Network error' };
  }
}

export function BulkAddBookmarksButton() {
  const drawer = useItemDrawer();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<FailedLink[]>([]);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 20);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const parsed = useMemo(() => parseInput(text), [text]);
  const overLimit = parsed.valid.length > MAX_LINKS;

  const reset = useCallback(() => {
    setText('');
    setSubmitting(false);
    setProgress({ done: 0, total: 0 });
    setFailures([]);
    setCompletedCount(null);
  }, []);

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    reset();
  }, [submitting, reset]);

  const submit = useCallback(async () => {
    if (parsed.valid.length === 0 || overLimit) return;
    setSubmitting(true);
    setFailures([]);
    setCompletedCount(null);
    setProgress({ done: 0, total: parsed.valid.length });

    const pb = getPb();
    const queue = [...parsed.valid];
    const failed: FailedLink[] = [];
    let done = 0;
    let succeeded = 0;

    async function worker() {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;
        const result = await ingestOne(url);
        if ('id' in result) {
          succeeded += 1;
          try {
            const record = await pb.collection('items').getOne<Item>(result.id);
            drawer.emit({ kind: 'created', item: record });
          } catch {
            // Non-fatal — grid will catch it on next refresh.
          }
        } else {
          failed.push({ url, reason: result.error });
        }
        done += 1;
        setProgress({ done, total: parsed.valid.length });
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, parsed.valid.length) }, () => worker());
    await Promise.all(workers);

    setFailures(failed);
    setCompletedCount(succeeded);
    setSubmitting(false);

    if (failed.length === 0) {
      setOpen(false);
      reset();
    } else {
      setText('');
    }
  }, [parsed.valid, overLimit, drawer, reset]);

  const showSummary = completedCount !== null;

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        data-testid="bulk-add-open"
      >
        <ListIcon size={16} strokeWidth={1.75} />
        Bulk add
      </Button>

      {open && mounted
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-add-title"
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        >
          <div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-background/70 backdrop-blur-md animate-fade-up"
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-card-hover animate-fade-up">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <h2
                id="bulk-add-title"
                className="font-display text-xl leading-none text-foreground"
              >
                Bulk add links
              </h2>
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
              >
                <XIcon size={16} strokeWidth={1.75} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="flex flex-col gap-4 px-5 py-5"
            >
              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Paste URLs
                </span>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'https://example.com/article-one\nhttps://example.com/article-two\nhttps://example.com/article-three'}
                  disabled={submitting}
                  rows={8}
                  spellCheck={false}
                  data-testid="bulk-add-input"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
                />
                <span className="text-xs text-muted">
                  One per line — commas, spaces, and tabs also work.
                </span>
              </label>

              {parsed.valid.length > 0 || parsed.invalid.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-foreground"
                    data-testid="bulk-add-count-valid"
                  >
                    <span className="font-semibold">{parsed.valid.length}</span>
                    <span className="text-muted">valid</span>
                  </span>
                  {parsed.invalid.length > 0 ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300"
                      data-testid="bulk-add-count-invalid"
                    >
                      <span className="font-semibold">{parsed.invalid.length}</span>
                      <span className="opacity-80">skipped</span>
                    </span>
                  ) : null}
                  {overLimit ? (
                    <span className="text-red-600 dark:text-red-400">
                      Max {MAX_LINKS} per batch.
                    </span>
                  ) : null}
                </div>
              ) : null}

              {submitting ? (
                <div
                  className="flex items-center gap-2 text-xs text-muted"
                  data-testid="bulk-add-progress"
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size={14} />
                  <span>
                    Queuing {progress.done} of {progress.total}…
                  </span>
                </div>
              ) : null}

              {showSummary && failures.length > 0 ? (
                <div
                  className="rounded-lg border border-red-300/70 bg-red-50/60 p-3 text-xs dark:border-red-900/60 dark:bg-red-950/30"
                  data-testid="bulk-add-failures"
                  role="alert"
                >
                  <p className="font-medium text-red-700 dark:text-red-300">
                    Added {completedCount}, failed {failures.length}.
                  </p>
                  <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-red-700/90 dark:text-red-300/90">
                    {failures.slice(0, 10).map((f) => (
                      <li key={f.url} className="break-all">
                        <span className="font-mono">{f.url}</span>
                        <span className="opacity-70"> — {f.reason}</span>
                      </li>
                    ))}
                    {failures.length > 10 ? (
                      <li className="opacity-70">…and {failures.length - 10} more.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <p className="text-xs text-muted">
                Each link is scraped, summarized, and tagged in the background.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="md" onClick={close} disabled={submitting}>
                  {failures.length > 0 ? 'Done' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  size="md"
                  disabled={submitting || parsed.valid.length === 0 || overLimit}
                  data-testid="bulk-add-confirm"
                >
                  {submitting ? <Spinner size={14} /> : null}
                  {submitting
                    ? 'Adding…'
                    : parsed.valid.length > 0
                    ? `Add ${parsed.valid.length} link${parsed.valid.length === 1 ? '' : 's'}`
                    : 'Add links'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
