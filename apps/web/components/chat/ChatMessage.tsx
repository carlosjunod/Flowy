'use client';

import { Fragment, useMemo } from 'react';
import type { ChatMessageData } from './ChatWindow';
import { ItemChip } from './ItemChip';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';

export interface ChatItemRef {
  id: string;
  type: string;
  title?: string | null;
  category?: string | null;
  source_url: string | null;
  r2_key?: string | null;
}

interface Props {
  message: ChatMessageData;
}

const CITATION_RE = /\[\[(item_[a-z0-9]+)\]\]/gi;

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function TypeIcon({ type }: { type: string }) {
  const glyph: Record<string, string> = {
    url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬',
  };
  return <span aria-hidden>{glyph[type] ?? '📎'}</span>;
}

function renderWithChips(text: string, byId: Map<string, ChatItemRef>) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(CITATION_RE.source, CITATION_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const token = match[0];
    const id = match[1];
    if (!id) continue;
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<ItemChip key={`${id}-${match.index}`} id={id} item={byId.get(id)} />);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

function collectCitedIds(text: string): string[] {
  const ids = new Set<string>();
  const regex = new RegExp(CITATION_RE.source, CITATION_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
}

export function ChatMessage({ message }: Props) {
  const drawer = useItemDrawer();
  const isUser = message.role === 'user';
  const items = message.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const citedIds = useMemo(() => (isUser ? [] : collectCitedIds(message.content)), [isUser, message.content]);

  const citedItems = useMemo(
    () => citedIds.map((id) => byId.get(id)).filter((x): x is ChatItemRef => Boolean(x)),
    [citedIds, byId],
  );
  const fallbackItems = useMemo(() => (citedItems.length === 0 ? items.slice(0, 3) : []), [citedItems, items]);
  const railItems = citedItems.length > 0 ? citedItems : fallbackItems;
  const railLabel = citedItems.length > 0 ? 'Sources' : 'Might be related';

  return (
    <div className={isUser ? 'flex justify-end' : 'flex flex-col gap-3'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-white text-black px-4 py-2 text-sm'
            : 'max-w-[90%] rounded-2xl bg-white/10 px-4 py-3 text-sm text-white whitespace-pre-wrap'
        }
      >
        {isUser
          ? message.content
          : message.content
            ? renderWithChips(message.content, byId)
            : <span className="text-white/40">…</span>}
      </div>
      {!isUser && railItems.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="pl-1 text-[11px] uppercase tracking-wide text-white/40">{railLabel}</span>
          <div className="-mx-1 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pl-1">
            {railItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => drawer.open(item.id)}
                data-testid="item-card"
                className="group flex min-w-[200px] snap-start flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-3 text-left text-xs hover:border-white/30"
              >
                <span className="flex items-center gap-1 text-white/60">
                  <TypeIcon type={item.type} />
                  <span>{domainFromUrl(item.source_url) ?? item.type}</span>
                </span>
                <span className="line-clamp-2 font-medium text-white">{truncate(item.title ?? '(untitled)', 40)}</span>
                <span className="text-white/40">Open details →</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
