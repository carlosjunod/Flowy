import Link from 'next/link';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { ItemDrawerProvider } from '@/components/inbox/ItemDrawerProvider';
import { Brand } from '@/components/ui/Brand';
import { NavLink } from '@/components/ui/NavLink';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ItemDrawerProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/chat" className="group inline-flex items-center transition-opacity hover:opacity-80">
              <Brand size="sm" />
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/chat">Chat</NavLink>
              <NavLink href="/inbox">Inbox</NavLink>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <ThemeToggle />
              <LogoutButton />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ItemDrawerProvider>
  );
}
