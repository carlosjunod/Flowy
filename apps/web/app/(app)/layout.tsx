import Link from 'next/link';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { ItemDrawerProvider } from '@/components/inbox/ItemDrawerProvider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ItemDrawerProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/60 px-6 py-3 backdrop-blur">
          <Link href="/chat" className="text-sm font-semibold tracking-tight">
            Tryflowy
          </Link>
          <nav className="flex items-center gap-4 text-sm text-white/80">
            <Link href="/chat" className="hover:text-white">Chat</Link>
            <Link href="/inbox" className="hover:text-white">Inbox</Link>
            <LogoutButton />
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ItemDrawerProvider>
  );
}
