import { BulkAddBookmarksButton } from '@/components/inbox/BulkAddBookmarksButton';
import { InboxGrid } from '@/components/inbox/InboxGrid';
import { SubmitBookmarkButton } from '@/components/inbox/SubmitBookmarkButton';

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex items-end justify-between gap-4 animate-fade-up">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Your library
          </span>
          <h1 className="font-display text-4xl leading-none text-foreground sm:text-5xl">
            Inbox
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <BulkAddBookmarksButton />
          <SubmitBookmarkButton />
        </div>
      </header>
      <InboxGrid />
    </div>
  );
}
