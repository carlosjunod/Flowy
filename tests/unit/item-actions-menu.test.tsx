import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const openItemMock = vi.fn();
const reloadItemMock = vi.fn();
const deleteItemMock = vi.fn();

vi.mock('@/lib/hooks/useItemActions', () => ({
  useItemActions: () => ({
    openItem: openItemMock,
    reloadItem: reloadItemMock,
    deleteItem: deleteItemMock,
    reloadMany: vi.fn(),
    deleteMany: vi.fn(),
    pending: new Set<string>(),
  }),
}));

const { ItemActionsMenu } = await import('../../apps/web/components/inbox/ItemActionsMenu');

beforeEach(() => {
  openItemMock.mockReset();
  reloadItemMock.mockReset();
  deleteItemMock.mockReset();
});

describe('ItemActionsMenu', () => {
  it('renders Open/Reload/Delete when status=ready', () => {
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /open/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeEnabled();
  });

  it('disables Reload when status=pending', () => {
    render(<ItemActionsMenu itemId="i1" status="pending" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeDisabled();
  });

  it('disables Reload when status=processing', () => {
    render(<ItemActionsMenu itemId="i1" status="processing" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeDisabled();
  });

  it('calls openItem on Open click', () => {
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open/i }));
    expect(openItemMock).toHaveBeenCalledWith('i1');
  });

  it('calls reloadItem on Reload click', () => {
    reloadItemMock.mockResolvedValue({ ok: true, data: {} });
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /reload/i }));
    expect(reloadItemMock).toHaveBeenCalledWith('i1');
  });

  it('calls deleteItem on Delete click', () => {
    deleteItemMock.mockResolvedValue({ ok: true, data: { id: 'i1' } });
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(deleteItemMock).toHaveBeenCalledWith('i1');
  });
});
