'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { ChatMessage, type ChatItemRef } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SparkleIcon } from '@/components/ui/icons';

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  items?: ChatItemRef[];
}

const EXAMPLES = [
  'Show me the design posts I saved',
  'What did I save about AI agents?',
  'Recent YouTube videos about startups',
];

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessageData = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', items: [] }]);
    setStreaming(true);

    try {
      const history = messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok || !res.body) {
        const errText = `⚠️ Request failed (${res.status})`;
        setMessages((prev) => updateLastAssistant(prev, errText, []));
        return;
      }

      let items: ChatItemRef[] = [];
      try {
        const header = res.headers.get('x-items');
        if (header) items = JSON.parse(header) as ChatItemRef[];
      } catch {
        items = [];
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        setMessages((prev) => updateLastAssistant(prev, buffered, items));
      }
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  const empty = messages.length === 0;

  return (
    <div className="relative flex h-full flex-col">
      {empty ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] -z-0 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-halo-accent blur-2xl animate-halo-drift"
        />
      ) : null}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center animate-fade-up">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
              <SparkleIcon size={32} strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-4xl leading-[1.1] text-foreground sm:text-5xl">
                Ask anything about <br /><span className="italic text-accent">your saved content</span>
              </h2>
              <p className="max-w-md text-sm text-muted">
                Flowy searches across every article, screenshot, video, and receipt you've ever shared.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void sendMessage(ex)}
                  className="rounded-full border border-border bg-surface-elevated px-3.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 stagger-child">
            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
          </div>
        )}
      </div>
      <div className="relative z-10 border-t border-border/70 bg-background/80 p-4 backdrop-blur-xl sm:px-6">
        <ChatInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}

function updateLastAssistant(
  prev: ChatMessageData[],
  content: string,
  items: ChatItemRef[],
): ChatMessageData[] {
  if (prev.length === 0) return prev;
  const copy = prev.slice();
  const last = copy[copy.length - 1];
  if (last && last.role === 'assistant') {
    copy[copy.length - 1] = { ...last, content, items };
  }
  return copy;
}
