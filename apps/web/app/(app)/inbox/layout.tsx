import { SelectionProvider } from '@/components/inbox/SelectionProvider';
import { SelectionActionBar } from '@/components/inbox/SelectionActionBar';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <SelectionProvider>
      {children}
      <SelectionActionBar />
    </SelectionProvider>
  );
}
