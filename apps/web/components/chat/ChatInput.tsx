'use client';

import { useRef, useState, useEffect, type KeyboardEvent } from 'react';

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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mx-auto flex max-w-3xl items-end gap-2"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={1}
        placeholder="Ask about your saved content…"
        className="flex-1 resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
        disabled={disabled}
        data-testid="chat-input"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        data-testid="chat-send"
      >
        {disabled ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
}
