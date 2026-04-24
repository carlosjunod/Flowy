'use client';

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessageData } from './ChatWindow';
import { ItemChip } from './ItemChip';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import { ItemActionsMenu } from '@/components/inbox/ItemActionsMenu';
import { TypeIcon } from '@/components/ui/icons';

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
const ITEM_HREF_PREFIX = 'item://';

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

function preprocessCitations(text: string): string {
  return text.replace(CITATION_RE, (_match, id: string) => `[${id}](${ITEM_HREF_PREFIX}${id})`);
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

  const markdownSource = useMemo(
    () => (isUser ? '' : preprocessCitations(message.content.trim())),
    [isUser, message.content],
  );

  const mdComponents = useMemo<Components>(() => ({
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    h1: ({ children }) => (
      <h1 className="mt-3 mb-2 font-display text-base font-semibold text-foreground first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-3 mb-2 font-display text-[15px] font-semibold text-foreground first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-2 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</h3>
    ),
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 rounded-r-md border-l-2 border-accent bg-accent/[0.06] px-3 py-1.5 italic text-foreground/90 first:mt-0 last:mb-0">
        {children}
      </blockquote>
    ),
    code: ({ children, className, ...rest }) => (
      <code
        className={`rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[12.5px] text-foreground ${className ?? ''}`}
        {...rest}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-foreground/[0.04] p-3 font-mono text-[12.5px] leading-relaxed text-foreground first:mt-0 last:mb-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-foreground">
        {children}
      </pre>
    ),
    a: ({ href, children }) => {
      if (href && href.startsWith(ITEM_HREF_PREFIX)) {
        const id = href.slice(ITEM_HREF_PREFIX.length);
        return <ItemChip id={id} item={byId.get(id)} />;
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    hr: () => <hr className="my-3 border-border" />,
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-border px-2 py-1 font-semibold text-foreground">{children}</th>
    ),
    td: ({ children }) => <td className="border-b border-border/60 px-2 py-1 text-foreground/90">{children}</td>,
  }), [byId]);

  return (
    <div className={isUser ? 'flex justify-end' : 'flex flex-col gap-3'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-background shadow-card'
            : 'max-w-[90%] rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-sm leading-relaxed text-foreground shadow-card'
        }
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => url}
            components={mdComponents}
          >
            {markdownSource}
          </ReactMarkdown>
        ) : (
          <span className="text-muted">…</span>
        )}
      </div>
      {!isUser && railItems.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="pl-1 text-[11px] font-medium uppercase tracking-wide text-muted">{railLabel}</span>
          <div className="-mx-1 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pl-1">
            {railItems.map((item) => (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => drawer.open(item.id)}
                  data-testid="item-card"
                  className="flex min-w-[220px] snap-start flex-col gap-1.5 rounded-xl border border-border bg-surface-elevated p-3 text-left text-xs shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover"
                >
                  <span className="flex items-center gap-1.5 text-muted">
                    <TypeIcon type={item.type} size={12} strokeWidth={2} />
                    <span className="truncate">{domainFromUrl(item.source_url) ?? item.type}</span>
                  </span>
                  <span className="line-clamp-2 font-medium text-foreground">{truncate(item.title ?? '(untitled)', 40)}</span>
                  <span className="inline-flex items-center gap-1 text-accent opacity-80 transition-opacity group-hover:opacity-100">
                    Open details →
                  </span>
                </button>
                <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
                  <ItemActionsMenu itemId={item.id} status={(item as { status?: 'pending' | 'processing' | 'ready' | 'error' }).status ?? 'ready'} variant="hover" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
