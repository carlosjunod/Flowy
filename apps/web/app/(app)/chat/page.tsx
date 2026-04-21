import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatPage() {
  // Header is ~65px in the refined layout; the chat column fills the rest of the viewport.
  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-4xl flex-col">
      <ChatWindow />
    </div>
  );
}
