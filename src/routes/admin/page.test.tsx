import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type { AdminMember } from '@/routes/admin/members-admin';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  members: [] as AdminMember[],
  deleted: [] as string[],
  statusCalls: [] as [string, string][],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/routes/admin/members-admin', () => ({
  fetchAdminMembers: () => Promise.resolve({ ok: true as const, members: api.members }),
  deleteMember: (id: string) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.deleted.push(id);
    api.members = api.members.filter((m) => m.id !== id);
    return Promise.resolve({ ok: true });
  },
  setMemberStatus: (id: string, status: string) => {
    api.statusCalls.push([id, status]);
    return Promise.resolve({ ok: true });
  },
}));

const { default: AdminPage } = await import('@/routes/admin/page');

const member = (o: Partial<AdminMember> = {}): AdminMember => ({
  id: 'm1',
  displayName: 'Alfred S',
  phone: '12222222222',
  type: 'peer',
  status: 'active',
  isAdmin: false,
  isSeed: false,
  city: 'Foster City',
  state: 'CA',
  createdAt: '2026-09-11T08:43:18Z',
  ...o,
});

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/peers" element={<p>The deck</p>} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'me', isAdmin: true };
  api.members = [member()];
  api.deleted = [];
  api.statusCalls = [];
  api.failWith = null;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminPage', () => {
  it('sends an ordinary member back to the club rather than showing an empty tool', async () => {
    account.current = { status: 'member', userId: 'me', isAdmin: false };
    renderAdmin();
    expect(await screen.findByText('The deck')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the welcome screen', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false };
    renderAdmin();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  it('lists joined members with the phone an admin needs to identify them', async () => {
    renderAdmin();
    expect(await screen.findByText('Alfred S')).toBeInTheDocument();
    expect(screen.getByText(/12222222222/)).toBeInTheDocument();
  });

  it('separates people who joined from the seeded directory', async () => {
    api.members = [member(), member({ id: 'm2', displayName: 'Todd', isSeed: true })];
    renderAdmin();
    expect(await screen.findByText('1 joined · 1 from the directory')).toBeInTheDocument();
  });

  it('suspends a member', async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    await waitFor(() => {
      expect(api.statusCalls).toEqual([['m1', 'suspended']]);
    });
  });

  it('offers to reactivate somebody already suspended', async () => {
    api.members = [member({ status: 'suspended' })];
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));
    await waitFor(() => {
      expect(api.statusCalls).toEqual([['m1', 'active']]);
    });
  });

  it('asks before deleting, because a real person loses their profile', async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.deleted).toEqual(['m1']);
    });
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(api.deleted).toEqual([]);
  });

  it("shows the database's own refusal rather than a rewritten one", async () => {
    api.failWith = 'An administrator cannot be deleted from the application';
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText('An administrator cannot be deleted from the application'),
    ).toBeInTheDocument();
  });

  it('marks who you are, so you do not act on your own row by accident', async () => {
    api.members = [member({ id: 'me', displayName: 'Alfred Shaheen', isAdmin: true })];
    renderAdmin();
    expect(await screen.findByText('you')).toBeInTheDocument();
    // The page heading is also "Admin", so match the badge specifically.
    const badges = screen.getAllByText('Admin').filter((el) => el.tagName !== 'H1');
    expect(badges).toHaveLength(1);
  });
});
