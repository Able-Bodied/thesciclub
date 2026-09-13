import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type * as MembersAdmin from '@/routes/admin/members-admin';
import {
  type AdminInvite,
  type AdminMember,
  canRevoke,
  inviteState,
  vouchedBy,
} from '@/routes/admin/members-admin';

const account = vi.hoisted(() => ({ current: null as Account | null }));
let confirmSpy: MockInstance<typeof window.confirm>;
let promptSpy: MockInstance<typeof window.prompt>;
const api = vi.hoisted(() => ({
  members: [] as AdminMember[],
  invites: [] as AdminInvite[],
  deleted: [] as string[],
  revoked: [] as string[],
  statusCalls: [] as [string, string][],
  typeCalls: [] as [string, string][],
  created: [] as unknown[],
  blocked: [] as {
    id: string;
    phone: string;
    reason: string | null;
    blockedAt: string;
    blockedBy: string | null;
  }[],
  blockCalls: [] as [string, string | null][],
  unblocked: [] as string[],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
// Partial: the network calls are stubbed, but `inviteState` is a pure
// formatter and the page should be rendering the real one — a stub of it would
// let this file assert whatever wording it liked.
vi.mock('@/routes/admin/members-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof MembersAdmin>()),
  fetchAdminMembers: () => Promise.resolve({ ok: true as const, members: api.members }),
  fetchInvites: () => Promise.resolve({ ok: true as const, invites: api.invites }),
  fetchBlockedNumbers: () => Promise.resolve(api.blocked),
  blockNumber: (phone: string, reason: string | null) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.blockCalls.push([phone, reason]);
    return Promise.resolve({ ok: true });
  },
  unblockNumber: (phone: string) => {
    api.unblocked.push(phone);
    api.blocked = api.blocked.filter((b) => b.phone !== phone);
    return Promise.resolve({ ok: true });
  },
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
  invitesUsed: 0,
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
  api.blocked = [];
  api.blockCalls = [];
  api.unblocked = [];
  api.failWith = null;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Harassing members');
  // vi.spyOn on an already-spied method hands back the *existing* spy, so
  // without this the call history survives from one test to the next and
  // `not.toHaveBeenCalled()` asserts against the previous test's clicks.
  // Setting a return value works either way, which is why the older tests
  // here never noticed.
  confirmSpy.mockClear();
  promptSpy.mockClear();
});

describe('getting back out', () => {
  it('offers a link to Me', async () => {
    renderAdmin();
    const back = await screen.findByRole('link', { name: 'Me' });
    expect(back).toHaveAttribute('href', '/me');
  });
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

describe('what an invite can have done to it', () => {
  it('offers revoke on an invite nobody is on', () => {
    // It read "unused", offered no way to act on it, and the number underneath
    // could not be invited again while the dead row counted as live.
    expect(canRevoke(invite({ status: 'consumed', heldBy: null }))).toBe(true);
  });

  it('does not offer revoke when somebody is on the number', () => {
    // That would take a membership away through the wrong door.
    expect(canRevoke(invite({ status: 'consumed', heldBy: 'Bob', heldByStatus: 'active' }))).toBe(
      false,
    );
  });

  it('offers nothing when the database cannot say who holds it', () => {
    const { heldBy: _h, ...unknownHolder } = invite({ status: 'consumed' });
    expect(canRevoke(unknownHolder as AdminInvite)).toBe(false);
  });

  it('always offers revoke on a pending invite', () => {
    expect(canRevoke(invite({ status: 'pending' }))).toBe(true);
  });
});

describe('what an invite says it is', () => {
  it('names the member holding it rather than saying "consumed"', () => {
    expect(inviteState(invite({ status: 'consumed', heldBy: 'Bob', heldByStatus: 'active' }))).toBe(
      'used by Bob',
    );
  });

  it('reads an invite backing nobody exactly like one never used', () => {
    // The row this was found on. "consumed" claimed somebody used this and is
    // in the club, when nobody is — and a word of its own only raised the
    // question of what the difference was, when for an administrator there
    // isn't one: nobody is behind it and it can come off the list.
    expect(inviteState(invite({ status: 'consumed', heldBy: null }))).toBe('not used yet');
    expect(inviteState(invite({ status: 'consumed', heldBy: null }))).toBe(
      inviteState(invite({ status: 'pending' })),
    );
  });

  it('claims nothing about a holder the database does not report', () => {
    // `held_by` arrived in a later migration. An app deployed ahead of its
    // database printed "that account has since been deleted" against every
    // used invite, the club's own administrator included, purely because the
    // column was missing. Absent is not the same as none.
    const { heldBy: _h, heldByStatus: _s, ...withoutTheColumn } = invite({ status: 'consumed' });
    expect(inviteState(withoutTheColumn as AdminInvite)).toBe('used');
  });

  it('does not present a removed member as a member in good standing', () => {
    expect(
      inviteState(invite({ status: 'consumed', heldBy: 'Bob', heldByStatus: 'removed' })),
    ).toBe('used by Bob, who was removed');
  });

  it('puts the other two states in English too', () => {
    expect(inviteState(invite({ status: 'pending' }))).toBe('not used yet');
    expect(inviteState(invite({ status: 'revoked' }))).toBe('revoked');
  });
});

describe('who vouched', () => {
  // The distinction the page used to lose: both rendered as a bare name, so
  // an organization's invite and a mentor's were indistinguishable.
  it('names a mentor as one, and an organization plainly', () => {
    expect(vouchedBy(invite({ invitedByOrganization: 'NorCal SCI', invitedByMember: null }))).toBe(
      'NorCal SCI',
    );
    expect(vouchedBy(invite({ invitedByOrganization: null, invitedByMember: 'Todd' }))).toBe(
      'Todd (mentor)',
    );
  });

  it('says so when the inviter’s account is gone', () => {
    expect(vouchedBy(invite({ invitedByOrganization: null, invitedByMember: null }))).toBe(
      'unknown',
    );
  });
});

describe('somebody who started and stopped', () => {
  // The state nothing could show before: the invite is consumed by a trigger
  // on the member insert, so abandoning onboarding leaves it pending and
  // looking exactly like a number nobody has touched.
  it('is not read as an untouched number', () => {
    expect(inviteState(invite({ status: 'pending', hasAccount: true }))).toBe(
      'signed up, never finished joining',
    );
    expect(inviteState(invite({ status: 'pending', hasAccount: false }))).toBe('not used yet');
  });

  // A database that predates the column cannot tell us either way, and
  // guessing "they never signed up" would be asserting something unknown —
  // the same trap heldBy's three-valued handling exists for.
  it('says nothing extra where the view does not report it', () => {
    expect(inviteState(invite({ status: 'pending', hasAccount: undefined }))).toBe('not used yet');
  });
});

describe('blocking a number', () => {
  async function openInvites(user: ReturnType<typeof userEvent.setup>) {
    renderAdmin();
    await screen.findByRole('button', { name: 'invites' });
    await user.click(screen.getByRole('button', { name: 'invites' }));
  }

  // Two dialogs on purpose. Ban is the only action here that both deletes a
  // profile and forecloses the way back, and it sits beside buttons that do
  // neither — Delete removes somebody who can be re-invited tomorrow.
  it('asks twice before blocking a member, then sends the reason', async () => {
    const user = userEvent.setup();
    api.members = [member({ id: 'm9', displayName: 'Nuisance', phone: '14085550150' })];
    renderAdmin();
    await screen.findByText('Nuisance');

    await user.click(screen.getByRole('button', { name: 'Block' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(promptSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.blockCalls).toEqual([['14085550150', 'Harassing members']]);
    });
  });

  it('does nothing if the confirmation is declined', async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(false);
    api.members = [member({ id: 'm9', phone: '14085550150' })];
    renderAdmin();
    await screen.findByText('Alfred S');

    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(promptSpy).not.toHaveBeenCalled();
    expect(api.blockCalls).toEqual([]);
  });

  // Cancel on the reason has to abort rather than block without one: an
  // administrator who changes their mind at the second dialog has not
  // agreed to anything.
  it('does nothing if the reason is cancelled', async () => {
    const user = userEvent.setup();
    promptSpy.mockReturnValue(null);
    api.members = [member({ id: 'm9', phone: '14085550150' })];
    renderAdmin();
    await screen.findByText('Alfred S');

    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(api.blockCalls).toEqual([]);
  });

  it('records no reason rather than an empty one', async () => {
    const user = userEvent.setup();
    promptSpy.mockReturnValue('   ');
    api.members = [member({ id: 'm9', phone: '14085550150' })];
    renderAdmin();
    await screen.findByText('Alfred S');

    await user.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => {
      expect(api.blockCalls).toEqual([['14085550150', null]]);
    });
  });

  // Nobody has ever signed in as a seeded row, so there is no conduct to
  // answer for and the number came from the organization's directory.
  it('is not offered on a row from the directory', async () => {
    api.members = [member({ id: 's1', displayName: 'Seeded Sam', isSeed: true })];
    renderAdmin();
    await screen.findByText('Seeded Sam');
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
  });

  it('unblocks from the blocked list, after confirming', async () => {
    const user = userEvent.setup();
    api.blocked = [
      {
        id: 'b1',
        phone: '14085550150',
        reason: 'Harassing members',
        blockedAt: '2026-09-13T00:00:00Z',
        blockedBy: 'Admin',
      },
    ];
    await openInvites(user);

    expect(await screen.findByText('Harassing members', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => {
      expect(api.unblocked).toEqual(['14085550150']);
    });
  });
});

describe('the three lists', () => {
  // Withdrawn rows used to sit in "The list", which is the heading claiming
  // these numbers are on it, and they accumulate forever.
  it('keeps withdrawn numbers out of the list that says they are on it', async () => {
    const user = userEvent.setup();
    api.invites = [
      invite({ id: 'live', phone: '14085550001', status: 'pending' }),
      invite({ id: 'gone', phone: '14085550002', status: 'revoked' }),
    ];
    renderAdmin();
    await screen.findByRole('button', { name: 'invites' });
    await user.click(screen.getByRole('button', { name: 'invites' }));

    // Section renders a heading, a subtitle, then the rows — so the rows for
    // a section are two siblings along from its heading.
    const rowsUnder = (title: string) =>
      screen.getByText(title).nextElementSibling?.nextElementSibling as HTMLElement;

    await screen.findByText('The list');
    expect(within(rowsUnder('The list')).getByText('14085550001')).toBeInTheDocument();
    expect(within(rowsUnder('The list')).queryByText('14085550002')).toBeNull();
    expect(within(rowsUnder('Withdrawn')).getByText('14085550002')).toBeInTheDocument();
  });

  it('says nothing about withdrawn or blocked when there are none', async () => {
    const user = userEvent.setup();
    api.invites = [invite({ id: 'live', status: 'pending' })];
    renderAdmin();
    await screen.findByRole('button', { name: 'invites' });
    await user.click(screen.getByRole('button', { name: 'invites' }));

    await screen.findByText('The list');
    expect(screen.queryByText('Withdrawn')).toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
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
  heldBy: null,
  heldByStatus: null,
  hasAccount: false,
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

  it('offers no revoke on an invite somebody is on', async () => {
    // Revoking a live member's invite would take their membership away through
    // the wrong door. admin_set_member_status is that door.
    api.invites = [invite({ status: 'consumed', heldBy: 'Bob', heldByStatus: 'active' })];
    await openInvites();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('offers revoke on an invite nobody is on', async () => {
    // There is no member to remove instead, and the dead row keeps the number
    // off the list until somebody can clear it.
    api.invites = [invite({ status: 'consumed', heldBy: null })];
    await openInvites();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
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
