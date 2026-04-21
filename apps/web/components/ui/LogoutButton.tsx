'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/lib/pocketbase';
import { LogoutIcon } from './icons';

export function LogoutButton() {
  const router = useRouter();
  function handleLogout(): void {
    logout();
    router.push('/login');
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      data-testid="logout-button"
      aria-label="Sign out"
    >
      <LogoutIcon size={14} />
      <span>Logout</span>
    </button>
  );
}
