import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ids: [] as string[],
  reload: vi.fn(),
  unblock: vi.fn(),
  announce: vi.fn(),
}));
vi.mock('@/lib/blocks', () => ({
  useMyBlocks: () => ({
    blocked: state.ids.map((memberId) => ({ memberId, blockedAt: '2026-10-21' })),
    ids: new Set(state.ids),
    loading: false,
    error: null,
    reload: state.reload,
  }),
  unblockMember: state.unblock,
}));
vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () =>
    new Map([['bo', { id: 'bo', displayName: 'Bo', username: 'bo.b', photoPath: null }]]),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));

const { BlockedMembers } = await import('@/routes/me/blocked-members');

beforeEach(() => {
  state.ids = [];
  state.reload.mockReset();
  state.announce.mockReset();
  state.unblock.mockReset().mockResolvedValue({ ok: true, value: null });
});

describe('Blocked members', () => {
  it('says it follows the account, not the device', () => {
    render(<BlockedMembers />);
    expect(screen.getByRole('heading', { name: 'Blocked members' })).toBeInTheDocument();
    expect(screen.getByText(/These follow your account, wherever you sign in/)).toBeInTheDocument();
  });

  it('says how to block when nobody is blocked', () => {
    render(<BlockedMembers />);
    expect(screen.getByText(/You haven't blocked anybody/)).toBeInTheDocument();
  });

  it('lists each member with Unblock, and says when it worked', async () => {
    const user = userEvent.setup();
    state.ids = ['bo'];
    render(<BlockedMembers />);
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('@bo.b')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unblock Bo' }));
    expect(state.unblock).toHaveBeenCalledWith('bo');
    expect(state.announce).toHaveBeenCalledWith('Unblocked Bo.');
    expect(state.reload).toHaveBeenCalled();
  });

  it('keeps the member listed and says why when Unblock fails', async () => {
    const user = userEvent.setup();
    state.ids = ['bo'];
    state.unblock.mockResolvedValue({ ok: false, error: 'They are still blocked.' });
    render(<BlockedMembers />);
    await user.click(screen.getByRole('button', { name: 'Unblock Bo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('They are still blocked.');
    expect(state.reload).not.toHaveBeenCalled();
  });
});
