import { InboxGrid } from '@/components/inbox/InboxGrid';

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold">Inbox</h1>
      <InboxGrid />
    </div>
  );
}
