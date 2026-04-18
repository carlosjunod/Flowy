'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/lib/pocketbase';

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
      className="rounded-md border border-white/15 px-3 py-1 text-xs text-white/80 hover:text-white"
      data-testid="logout-button"
    >
      Logout
    </button>
  );
}
