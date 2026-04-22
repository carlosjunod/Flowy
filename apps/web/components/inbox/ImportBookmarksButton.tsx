'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PaperclipIcon, XIcon } from '@/components/ui/icons';
import { parseNetscapeBookmarks } from '@/lib/bookmarks/parser';
import {
  filterBookmarks,
  type AcceptedBookmark,
  type BookmarkFilterResult,
} from '@/lib/bookmarks/filter';

type Step = 'upload' | 'parsing' | 'preview' | 'importing' | 'done';

interface DryRunResult {
  accepted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
}

interface BulkResult {
  batch_id: string | null;
  accepted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

function postBulk(payload: unknown): Promise<Response> {
  return fetch('/api/ingest/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

function toServerEntries(accepted: AcceptedBookmark[]) {
  return accepted.map((a) => ({
    raw_url: a.bookmark.url,
    normalized_url: a.normalized_url,
    element_hash: a.element_hash,
    title: a.bookmark.title,
    folder_path: a.bookmark.folder_path,
    ...(a.bookmark.add_date ? { add_date: a.bookmark.add_date } : {}),
  }));
}

export function ImportBookmarksButton({ onBatchStarted }: { onBatchStarted?: (batchId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<BookmarkFilterResult | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && step !== 'importing') close();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const reset = useCallback(() => {
    setStep('upload');
    setError(null);
    setParseResult(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError('File is too large (max 20 MB). Export a smaller subset.');
      return;
    }
    setStep('parsing');
    setError(null);
    try {
      const html = await file.text();
      const parsed = parseNetscapeBookmarks(html);
      if (parsed.length === 0) {
        setError('No bookmarks found in that file.');
        setStep('upload');
        return;
      }
      const filtered = await filterBookmarks(parsed);
      setParseResult(filtered);

      if (filtered.accepted.length === 0) {
        setError('All bookmarks in that file were invalid or unsupported.');
        setStep('upload');
        return;
      }

      const res = await postBulk({
        items: toServerEntries(filtered.accepted),
        dry_run: true,
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: DryRunResult;
        error?: string;
      };
      if (!res.ok || !body.data) {
        setError(body.error ?? 'Preview failed. Try again.');
        setStep('upload');
        return;
      }

      // Client rejections (bad scheme, localhost, UNPARSEABLE) aren't sent to
      // server, so we fold them into skipped_invalid ourselves.
      const clientInvalid = filtered.rejected_invalid.length;
      const clientDupes = filtered.duplicates_in_import.length;
      setPreview({
        accepted: body.data.accepted,
        skipped_duplicates: body.data.skipped_duplicates + clientDupes,
        skipped_invalid: body.data.skipped_invalid + clientInvalid,
      });
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file.');
      setStep('upload');
    }
  }, []);

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  const confirmImport = useCallback(async () => {
    if (!parseResult) return;
    setStep('importing');
    setError(null);
    try {
      const res = await postBulk({
        items: toServerEntries(parseResult.accepted),
        batch_label: `Bookmark import · ${new Date().toLocaleDateString()}`,
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: BulkResult;
        error?: string;
      };
      if (!res.ok || !body.data) {
        setError(body.error ?? 'Import failed. Try again.');
        setStep('preview');
        return;
      }
      setResult(body.data);
      setStep('done');
      if (body.data.batch_id && onBatchStarted) onBatchStarted(body.data.batch_id);
    } catch {
      setError('Network error. Try again.');
      setStep('preview');
    }
  }, [parseResult, onBatchStarted]);

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        data-testid="import-bookmarks-open"
      >
        <PaperclipIcon size={16} strokeWidth={1.75} />
        Import bookmarks
      </Button>

      {open && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-bookmarks-title"
              className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            >
              <div
                aria-hidden
                onClick={step === 'importing' ? undefined : close}
                className="absolute inset-0 bg-background/70 backdrop-blur-md animate-fade-up"
              />
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-card-hover animate-fade-up">
                <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                  <h2
                    id="import-bookmarks-title"
                    className="font-display text-xl leading-none text-foreground"
                  >
                    Import bookmarks
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={step === 'importing'}
                    aria-label="Close"
                    className="rounded-full p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
                  >
                    <XIcon size={16} strokeWidth={1.75} />
                  </button>
                </div>

                <div className="flex flex-col gap-4 px-5 py-5">
                  {step === 'upload' && (
                    <>
                      <p className="text-sm text-muted">
                        Upload an HTML bookmarks export from Chrome, Safari, Firefox, or Edge.
                        Dead links are removed automatically. Duplicates against your existing
                        library are skipped.
                      </p>
                      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:border-accent/50 hover:bg-surface-elevated">
                        <PaperclipIcon size={24} strokeWidth={1.5} className="text-muted" />
                        <span className="text-sm font-medium text-foreground">Choose an .html file</span>
                        <span className="text-xs text-muted">or drag &amp; drop (max 20 MB)</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".html,text/html"
                          onChange={onFileSelected}
                          className="hidden"
                          data-testid="import-bookmarks-file"
                        />
                      </label>
                      {error ? (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      ) : null}
                    </>
                  )}

                  {step === 'parsing' && (
                    <div className="flex items-center gap-3 py-4 text-sm text-muted">
                      <Spinner size={16} />
                      <span>Reading bookmarks…</span>
                    </div>
                  )}

                  {step === 'preview' && preview && (
                    <>
                      <PreviewCounts preview={preview} />
                      <p className="text-xs text-muted">
                        Imports run in the background. Dead links (404, DNS failures) are
                        removed automatically — they won’t clutter your inbox.
                      </p>
                      {error ? (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="md" onClick={close}>
                          Cancel
                        </Button>
                        <Button
                          variant="accent"
                          size="md"
                          onClick={() => void confirmImport()}
                          disabled={preview.accepted === 0}
                          data-testid="import-bookmarks-confirm"
                        >
                          Import {preview.accepted.toLocaleString()}{' '}
                          {preview.accepted === 1 ? 'bookmark' : 'bookmarks'}
                        </Button>
                      </div>
                    </>
                  )}

                  {step === 'importing' && (
                    <div className="flex items-center gap-3 py-4 text-sm text-muted">
                      <Spinner size={16} />
                      <span>Queueing bookmarks…</span>
                    </div>
                  )}

                  {step === 'done' && result && (
                    <>
                      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                        <p className="text-foreground">
                          Queued {result.accepted.toLocaleString()}{' '}
                          {result.accepted === 1 ? 'bookmark' : 'bookmarks'} for import.
                        </p>
                        <p className="text-xs text-muted">
                          Progress shows in your inbox — processing typically takes 1–3 hours
                          for large imports. Dead links are deleted as they’re detected.
                        </p>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button variant="accent" size="md" onClick={close}>
                          Done
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PreviewCounts({ preview }: { preview: DryRunResult }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      <Row label="Will import" value={preview.accepted} emphasize />
      <Row label="Duplicates skipped" value={preview.skipped_duplicates} muted />
      <Row label="Invalid / unsupported" value={preview.skipped_invalid} muted />
    </dl>
  );
}

function Row({ label, value, emphasize, muted }: { label: string; value: number; emphasize?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <dt className={muted ? 'text-muted' : 'text-foreground'}>{label}</dt>
      <dd
        className={
          emphasize
            ? 'font-display text-xl text-foreground'
            : muted
            ? 'text-muted'
            : 'text-foreground'
        }
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
