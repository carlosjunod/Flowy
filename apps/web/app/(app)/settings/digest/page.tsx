import { DigestSettingsForm } from '../digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function DigestSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Settings</span>
        <h1 className="mt-1 font-display text-4xl text-foreground">Daily Digest</h1>
      </header>
      <DigestSettingsForm />
    </div>
  );
}
