'use client';

import { useRef, useState, useEffect, type KeyboardEvent } from 'react';
import { SendIcon } from '@/components/ui/icons';

interface Props {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  async function submit(): Promise<void> {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    await onSend(text);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const canSend = !disabled && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mx-auto flex max-w-3xl items-end gap-2"
    >
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Ask about your saved content…"
          className="w-full resize-none rounded-2xl border border-border bg-surface-elevated px-4 py-3 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
          disabled={disabled}
          data-testid="chat-input"
        />
      </div>
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={[
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-150 ease-out-expo',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'active:scale-[0.95] disabled:cursor-not-allowed',
          canSend
            ? 'bg-accent text-background shadow-card hover:bg-accent/90'
            : 'bg-surface text-muted border border-border',
        ].join(' ')}
        data-testid="chat-send"
      >
        {disabled ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
        ) : (
          <SendIcon size={16} strokeWidth={2} />
        )}
      </button>
    </form>
  );
}
