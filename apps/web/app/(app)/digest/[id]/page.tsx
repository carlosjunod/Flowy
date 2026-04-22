import Image from 'next/image';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import PocketBase from 'pocketbase';
import type { Digest } from '@/lib/digest/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function extractToken(): Promise<string | null> {
  const h = await headers();
  const authHeader = h.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice('Bearer '.length).trim();
  const jar = await cookies();
  const raw = jar.get('pb_auth')?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('{')) {
      const parsed = JSON.parse(decoded) as { token?: string };
      return parsed.token ?? null;
    }
    return decoded;
  } catch {
    return raw;
  }
}

async function loadDigest(id: string): Promise<Digest | null> {
  const token = await extractToken();
  if (!token) return null;
  const pb = new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    const digest = await pb.collection('digests').getOne<Digest>(id);
    if (digest.user !== auth.record.id) return null;
    return digest;
  } catch {
    return null;
  }
}

function formatWindow(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  } catch {
    return '';
  }
}

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const digest = await loadDigest(id);
  if (!digest) notFound();

  const sections = digest.content.sections ?? [];
  const windowLabel = formatWindow(digest.content.window_start, digest.content.window_end);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10 border-b border-border/60 pb-8">
        <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
          <span>Daily Digest</span>
          <Link href="/inbox" className="transition hover:text-foreground">Back to inbox</Link>
        </div>
        <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
          What you saved
        </h1>
        <p className="mt-3 text-sm text-muted">
          {windowLabel}
          {' · '}
          {digest.items_count} item{digest.items_count === 1 ? '' : 's'}
          {' across '}
          {digest.categories_count} categor{digest.categories_count === 1 ? 'y' : 'ies'}
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="text-muted">No categories were summarized for this digest.</p>
      ) : (
        <div className="space-y-14">
          {sections.map((section) => (
            <section key={section.category} className="animate-fade-up">
              <h2 className="mb-3 font-display text-3xl capitalize text-foreground">
                {section.category}
              </h2>
              <p className="mb-6 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                {section.summary}
              </p>
              {section.image_urls.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.image_urls.map((url) => (
                    <div
                      key={url}
                      className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface"
                    >
                      <Image
                        src={url}
                        alt={`${section.category} thumbnail`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
