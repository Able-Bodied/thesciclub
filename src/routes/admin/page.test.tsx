import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type { AdminInvite, AdminMember } from '@/routes/admin/members-admin';

const account = vi.hoisted(() => ({ current: null as Account | null }));
let confirmSpy: MockInstance<typeof window.confirm>;
const api = vi.hoisted(() => ({
  members: [] as AdminMember[],
  invites: [] as AdminInvite[],
  deleted: [] as string[],
  revoked: [] as string[],
  statusCalls: [] as [string, string][],
  typeCalls: [] as [string, string][],
  created: [] as unknown[],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/routes/admin/members-admin', () => ({
  fetchAdminMembers: () => Promise.resolve({ ok: true as const, members: api.members }),
  fetchInvites: () => Promise.resolve({ ok: true as const, invites: api.invites }),
  fetchInvitingOrganizations: () =>
    Promise.resolve([{ id: 'org1', name: 'NorCal SCI', shortCode: 'NCS' }]),
  fetchClaimableProfiles: () =>
    Promise.resolve([{ id: 'seed1', displayName: 'Bob', city: 'Aptos', state: 'CA' }]),
  createInvite: (input: unknown) => {
    api.created.push(input);
    return Promise.resolve({ ok: true });
  },
  revokeInvite: (id: string) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.revoked.push(id);
    return Promise.resolve({ ok: true });
  },
  setMemberType: (id: string, type: string) => {
    api.typeCalls.push([id, type]);
    return Promise.resolve({ ok: true });
  },
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
  account.current = { status: 'member', userId: 'me', isAdmin: true, displayName: 'Test' };
  api.members = [member()];
  api.invites = [];
  api.deleted = [];
  api.revoked = [];
  api.statusCalls = [];
  api.typeCalls = [];
  api.created = [];
  api.failWith = null;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminPage', () => {
  it('sends an ordinary member back to the club rather than showing an empty tool', async () => {
    account.current = { status: 'member', userId: 'me', isAdmin: false, displayName: 'Test' };
    renderAdmin();
    expect(await screen.findByText('The deck')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the welcome screen', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: 'Test' };
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
    await screen.findByText('Alfred S');
    // The counts share one line with the invite tally, so read the header whole
    // rather than matching a string that spans several elements.
    const header = screen.getByRole('banner');
    expect(header.textContent).toContain('1 joined');
    expect(header.textContent).toContain('1 from the directory');
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
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.deleted).toEqual(['m1']);
    });
  });

  it('does not delete when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false);
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

const invite = (o: Partial<AdminInvite> = {}): AdminInvite => ({
  id: 'i1',
  phone: '14085551234',
  status: 'pending',
  note: null,
  createdAt: '2026-09-11T09:00:00Z',
  invitedByOrganization: 'NorCal SCI',
  invitedByMember: null,
  claimableName: null,
  ...o,
});

describe('the invite list', () => {
  const openInvites = async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'invites' }));
  };

  it('counts who is waiting, in the header', async () => {
    api.invites = [invite(), invite({ id: 'i2', status: 'consumed' })];
    renderAdmin();
    expect(await screen.findByText(/1 invite waiting/)).toBeInTheDocument();
  });

  it('shows the list with who vouched for each number', async () => {
    api.invites = [invite()];
    await openInvites();
    expect(screen.getByText('14085551234')).toBeInTheDocument();
    // The form's organization dropdown also says "NorCal SCI"; the row's meta
    // line is the one followed by a separator.
    expect(screen.getByText(/NorCal SCI ·/)).toBeInTheDocument();
  });

  it('marks an invite that carries a claim', async () => {
    api.invites = [invite({ claimableName: 'Bob' })];
    await openInvites();
    expect(screen.getByText('claims Bob')).toBeInTheDocument();
  });

  it('revokes a pending invite, after confirming', async () => {
    api.invites = [invite()];
    await openInvites();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.revoked).toEqual(['i1']);
    });
  });

  it('offers no revoke on an invite somebody already used', async () => {
    api.invites = [invite({ status: 'consumed' })];
    await openInvites();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('will not add a number until it is complete', async () => {
    await openInvites();
    const add = screen.getByRole('button', { name: 'Add to the list' });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Phone number'), '4085550112');
    expect(screen.getByRole('button', { name: 'Add to the list' })).toBeEnabled();
  });

  it('only offers seeded profiles nobody has joined as yet', async () => {
    await openInvites();
    const select = screen.getByLabelText(/already in the directory/);
    expect(within(select).getByRole('option', { name: /Bob/ })).toBeInTheDocument();
  });

  it('warns before attaching somebody else’s profile to a number', async () => {
    await openInvites();
    await userEvent.selectOptions(screen.getByLabelText(/already in the directory/), 'seed1');
    expect(
      screen.getByText(/Attach it only if you know the number belongs to them/),
    ).toBeInTheDocument();
  });
});

describe('mentor status', () => {
  it('promotes a peer', async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Make mentor' }));
    await waitFor(() => {
      expect(api.typeCalls).toEqual([['m1', 'mentor']]);
    });
  });

  it('demotes a mentor', async () => {
    api.members = [member({ type: 'mentor' })];
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Make peer' }));
    await waitFor(() => {
      expect(api.typeCalls).toEqual([['m1', 'peer']]);
    });
  });
});
