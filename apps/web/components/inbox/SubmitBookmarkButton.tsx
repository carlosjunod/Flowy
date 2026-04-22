'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { LinkIcon, XIcon } from '@/components/ui/icons';
import { useItemDrawer } from './ItemDrawerProvider';

const ERROR_COPY: Record<string, string> = {
  MISSING_URL: 'Please enter a URL.',
  INVALID_TYPE: 'That URL doesn’t look right.',
  UNAUTHORIZED: 'Your session expired. Please log in again.',
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
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

export function SubmitBookmarkButton() {
  const drawer = useItemDrawer();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
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

  const reset = useCallback(() => {
    setUrl('');
    setError(null);
    setSubmitting(false);
  }, []);

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    reset();
  }, [submitting, reset]);

  const submit = useCallback(async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError('Please enter a valid URL.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'url', raw_url: normalized }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.data?.id) {
        const code = body.error ?? `HTTP_${res.status}`;
        setError(ERROR_COPY[code] ?? 'Could not save that link. Try again.');
        setSubmitting(false);
        return;
      }
      try {
        const pb = getPb();
        const record = await pb.collection('items').getOne<Item>(body.data.id);
        drawer.emit({ kind: 'created', item: record });
      } catch {
        // Non-fatal — grid can still pick it up on next load.
      }
      setOpen(false);
      reset();
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }, [url, drawer, reset]);

  return (
    <>
      <Button
        variant="accent"
        size="md"
        onClick={() => setOpen(true)}
        data-testid="submit-bookmark-open"
      >
        <LinkIcon size={16} strokeWidth={1.75} />
        Add link
      </Button>

      {open && mounted
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-bookmark-title"
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        >
          <div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-background/70 backdrop-blur-md animate-fade-up"
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-card-hover animate-fade-up">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <h2
                id="submit-bookmark-title"
                className="font-display text-xl leading-none text-foreground"
              >
                Add a link
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
                  URL
                </span>
                <input
                  ref={inputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="https://example.com/article"
                  disabled={submitting}
                  data-testid="submit-bookmark-input"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
                />
              </label>
              {error ? (
                <p
                  role="alert"
                  data-testid="submit-bookmark-error"
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  {error}
                </p>
              ) : null}
              <p className="text-xs text-muted">
                Flowy will scrape, summarize, and tag the page in the background. It shows up here as soon as processing finishes.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="md" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  size="md"
                  disabled={submitting || url.trim().length === 0}
                  data-testid="submit-bookmark-confirm"
                >
                  {submitting ? <Spinner size={14} /> : null}
                  {submitting ? 'Saving…' : 'Save link'}
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
