'use client';

import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import type { ChatItemRef } from './ChatMessage';
import { TypeIcon } from '@/components/ui/icons';

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
      className="inline-flex items-baseline gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/20"
    >
      <TypeIcon type={item?.type ?? 'url'} size={11} strokeWidth={2} className="translate-y-[1px]" />
      <span className="max-w-[18ch] truncate">{label}</span>
    </button>
  );
}
