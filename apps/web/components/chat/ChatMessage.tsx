'use client';

import type { ChatMessageData } from './ChatWindow';

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

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex flex-col gap-3'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-white text-black px-4 py-2 text-sm'
            : 'max-w-[90%] rounded-2xl bg-white/10 px-4 py-3 text-sm text-white'
        }
      >
        {message.content || <span className="text-white/40">…</span>}
      </div>
      {!isUser && message.items && message.items.length > 0 ? (
        <div className="-mx-1 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pl-1">
          {message.items.map((item) => (
            <a
              key={item.id}
              href={item.source_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              data-testid="item-card"
              className="group flex min-w-[200px] snap-start flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-3 text-left text-xs hover:border-white/30"
            >
              <span className="flex items-center gap-1 text-white/60">
                <TypeIcon type={item.type} />
                <span>{domainFromUrl(item.source_url) ?? item.type}</span>
              </span>
              <span className="line-clamp-2 font-medium text-white">{truncate(item.title ?? '(untitled)', 40)}</span>
              <span className="text-white/40">↗ open</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
