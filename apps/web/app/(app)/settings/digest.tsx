'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { DigestSettings } from '@/lib/digest/types';

const DEFAULT_TIME = '08:00';

function parseHhmm(value: string): { h: number; m: number } | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

function toUtcTime(localHhmm: string): string {
  const parsed = parseHhmm(localHhmm);
  if (!parsed) return localHhmm;
  const now = new Date();
  now.setHours(parsed.h, parsed.m, 0, 0);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function toLocalTime(utcHhmm: string): string {
  const parsed = parseHhmm(utcHhmm);
  if (!parsed) return utcHhmm;
  const now = new Date();
  now.setUTCHours(parsed.h, parsed.m, 0, 0);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function DigestSettingsForm() {
  const [enabled, setEnabled] = useState(false);
  const [localTime, setLocalTime] = useState(DEFAULT_TIME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/digest/settings', { cache: 'no-store' });
        const body = (await res.json()) as { data?: DigestSettings; error?: string };
        if (cancelled) return;
        if (!res.ok || !body.data) {
          setError(body.error ?? 'LOAD_FAILED');
        } else {
          setEnabled(body.data.digest_enabled);
          setLocalTime(toLocalTime(body.data.digest_time || DEFAULT_TIME));
        }
      } catch {
        if (!cancelled) setError('NETWORK_ERROR');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/digest/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          digest_enabled: enabled,
          digest_time: toUtcTime(localTime),
        }),
      });
      const body = (await res.json()) as { data?: DigestSettings; error?: string };
      if (!res.ok || !body.data) {
        setError(body.error ?? 'SAVE_FAILED');
      } else {
        setEnabled(body.data.digest_enabled);
        setLocalTime(toLocalTime(body.data.digest_time || DEFAULT_TIME));
        setStatus('Saved');
      }
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner />
        <span>Loading digest settings…</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <label htmlFor="digest-enabled" className="block text-sm font-medium text-foreground">
            Daily Digest
          </label>
          <p className="mt-1 text-sm text-muted">
            Get a newsletter-style summary of everything you saved in the last 24 hours.
          </p>
        </div>
        <input
          id="digest-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-5 w-5 cursor-pointer accent-accent"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <label htmlFor="digest-time" className="block text-sm font-medium text-foreground">
          Delivery time (your local time)
        </label>
        <p className="mt-1 text-sm text-muted">Stored in UTC. Defaults to 08:00 local.</p>
        <input
          id="digest-time"
          type="time"
          required
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {status && <span className="text-sm text-muted">{status}</span>}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}
