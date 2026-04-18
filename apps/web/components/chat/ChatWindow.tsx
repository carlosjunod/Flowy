'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { ChatMessage, type ChatItemRef } from './ChatMessage';
import { ChatInput } from './ChatInput';

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
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-white/70">
            <div className="text-6xl" aria-hidden>💬</div>
            <h2 className="text-lg font-semibold text-white">Ask anything about your saved content</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void sendMessage(ex)}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-white/30 hover:text-white"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 bg-black/40 p-4">
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
