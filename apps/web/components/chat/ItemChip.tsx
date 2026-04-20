'use client';

import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import type { ChatItemRef } from './ChatMessage';

const TYPE_GLYPH: Record<string, string> = {
  url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬',
};

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

interface Props {
  id: string;
  item?: ChatItemRef;
}

export function ItemChip({ id, item }: Props) {
  const drawer = useItemDrawer();
  const label = item?.title ? truncate(item.title, 32) : id;
  return (
    <button
      type="button"
      onClick={() => drawer.open(id)}
      data-testid="chat-item-chip"
      className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-xs align-baseline transition hover:border-white/40 hover:bg-white/20"
    >
      <span aria-hidden>{item ? (TYPE_GLYPH[item.type] ?? '📎') : '📎'}</span>
      <span className="max-w-[18ch] truncate">{label}</span>
    </button>
  );
}
