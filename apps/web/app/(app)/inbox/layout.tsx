import { SelectionProvider } from '@/components/inbox/SelectionProvider';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <SelectionProvider>{children}</SelectionProvider>;
}
