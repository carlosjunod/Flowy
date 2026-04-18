import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-3xl flex-col">
      <ChatWindow />
    </div>
  );
}
