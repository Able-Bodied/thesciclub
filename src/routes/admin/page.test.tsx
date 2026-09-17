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
  withdrawnNumbers,
} from '@/routes/admin/members-admin';

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
  blocked: [] as {
    id: string;
    phone: string;
    reason: string | null;
    blockedAt: string;
    blockedBy: string | null;
  }[],
  blockCalls: [] as [string, string | null][],
  unblocked: [] as string[],
  restores: 0,
  restoredCount: 4,
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
  restoreDirectory: () => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.restores += 1;
    return Promise.resolve({ ok: true, restored: api.restoredCount });
  },
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
  api.restores = 0;
  api.restoredCount = 4;
  api.failWith = null;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  // vi.spyOn on an already-spied method hands back the *existing* spy, so
  // without this the call history survives from one test to the next and
  // `not.toHaveBeenCalled()` asserts against the previous test's clicks.
  // Setting a return value works either way, which is why the older tests
  // here never noticed.
  confirmSpy.mockClear();
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

  it('pauses a member', async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(api.statusCalls).toEqual([['m1', 'suspended']]);
    });
  });

  it('offers to resume somebody already paused', async () => {
    api.members = [member({ status: 'suspended' })];
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(api.statusCalls).toEqual([['m1', 'active']]);
    });
  });

  it('asks before removing, because a real person loses their profile', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    // The panel, not a native dialog: nothing has happened yet.
    expect(screen.getByText(/Remove Alfred S from the club\?/)).toBeInTheDocument();
    expect(api.deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(api.deleted).toEqual(['m1']);
    });
  });

  it('does nothing when the panel is cancelled', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleted).toEqual([]);
    expect(screen.queryByText(/Remove Alfred S from the club\?/)).toBeNull();
  });

  it("shows the database's own refusal rather than a rewritten one", async () => {
    const user = userEvent.setup();
    api.failWith = 'An administrator cannot be deleted from the application';
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText('An administrator cannot be deleted from the application'),
    ).toBeInTheDocument();
  });

  it('offers no way to end an administrator’s membership, their own or another’s', async () => {
    // All three ways are refused by the database — admin_set_member_status,
    // admin_delete_member and admin_block_number — so two administrators
    // cannot lock each other out of the club they run. The screen should not
    // offer a button whose only outcome is that error.
    api.members = [
      member({ id: 'other-admin', displayName: 'Co-admin', isAdmin: true }),
      member({ id: 'ordinary', displayName: 'Ordinary', isAdmin: false }),
    ];
    renderAdmin();
    await screen.findByText('Co-admin');
    // One Pause and one Remove on the page, both belonging to the member who
    // can actually have either done to them.
    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove…' })).toHaveLength(1);
    expect(screen.getByText(/removed by the service role/i)).toBeInTheDocument();
  });

  it('still lets an administrator be made a peer or a mentor', async () => {
    // What somebody does, not whether they are still here.
    api.members = [member({ id: 'other-admin', displayName: 'Co-admin', isAdmin: true })];
    renderAdmin();
    expect(await screen.findByRole('button', { name: /Make (peer|mentor)/ })).toBeInTheDocument();
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

  // The checkbox is the whole difference between removing somebody and
  // banning them, so it is worth proving it is off by default: an
  // administrator who ticks nothing must not be blocking a number.
  it('removes without blocking unless the box is ticked', async () => {
    const user = userEvent.setup();
    api.members = [member({ id: 'm9', displayName: 'Nuisance', phone: '14085550150' })];
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));

    expect(screen.getByRole('checkbox', { name: /Block this number too/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(api.deleted).toEqual(['m9']);
    });
    expect(api.blockCalls).toEqual([]);
  });

  it('blocks instead, with a reason, when the box is ticked', async () => {
    const user = userEvent.setup();
    api.members = [member({ id: 'm9', displayName: 'Nuisance', phone: '14085550150' })];
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    await user.click(screen.getByRole('checkbox', { name: /Block this number too/ }));

    // The button says what it will do, rather than leaving the tick to be
    // remembered.
    await user.type(screen.getByLabelText(/Reason/), 'Harassing members');
    await user.click(screen.getByRole('button', { name: 'Remove and block' }));

    await waitFor(() => {
      expect(api.blockCalls).toEqual([['14085550150', 'Harassing members']]);
    });
    // blockNumber deletes the member itself — two calls would be two
    // round trips with a gap where the number is blocked and they are not.
    expect(api.deleted).toEqual([]);
  });

  it('records no reason rather than an empty one', async () => {
    const user = userEvent.setup();
    api.members = [member({ id: 'm9', phone: '14085550150' })];
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    await user.click(screen.getByRole('checkbox', { name: /Block this number too/ }));
    await user.type(screen.getByLabelText(/Reason/), '   ');
    await user.click(screen.getByRole('button', { name: 'Remove and block' }));

    await waitFor(() => {
      expect(api.blockCalls).toEqual([['14085550150', null]]);
    });
  });

  it('asks for no reason until there is something to give one for', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));
    expect(screen.queryByLabelText(/Reason/)).toBeNull();
  });

  // Nobody has ever signed in as a seeded row, so there is no conduct to
  // answer for and the number came from the organization's directory.
  // It used to be hidden here, on the grounds that nobody signs in as a
  // seeded row. But the number on one is a real person's, twenty-two of the
  // rows on this tab are seeded, and an option missing from most of them
  // reads as broken.
  it('offers the block option on a directory row too', async () => {
    const user = userEvent.setup();
    api.members = [
      member({ id: 's1', displayName: 'Seeded Sam', phone: '15555550000', isSeed: true }),
    ];
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Remove…' }));

    await user.click(screen.getByRole('checkbox', { name: /Block this number too/ }));
    await user.click(screen.getByRole('button', { name: 'Remove and block' }));
    await waitFor(() => {
      expect(api.blockCalls).toEqual([['15555550000', null]]);
    });
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

describe('restoring the directory', () => {
  // Every rehearsal of the claim flow retires a seeded profile, so this is
  // the button that makes the flow rehearsable more than once.
  it('restores after confirming, and says how many came back', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Restore directory' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.restores).toBe(1);
    });
    // A count rather than "done" — the difference between putting four
    // profiles back and quietly matching nothing is the whole message.
    expect(await screen.findByText(/4 profiles set back/)).toBeInTheDocument();
  });

  it('counts one profile in the singular', async () => {
    const user = userEvent.setup();
    api.restoredCount = 1;
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Restore directory' }));
    expect(await screen.findByText(/1 profile set back/)).toBeInTheDocument();
  });

  it('does nothing when the confirmation is declined', async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(false);
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Restore directory' }));
    expect(api.restores).toBe(0);
  });

  it("shows the database's refusal rather than claiming success", async () => {
    const user = userEvent.setup();
    api.failWith = 'Not an administrator';
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Restore directory' }));
    expect(await screen.findByText('Not an administrator')).toBeInTheDocument();
    expect(screen.queryByText(/set back/)).toBeNull();
  });
});

describe('the withdrawn list', () => {
  const revoked = (phone: string, id: string, createdAt: string) =>
    invite({ id, phone, status: 'revoked', createdAt });

  // Re-inviting writes a new row rather than reviving the old one, which is
  // right — a second invitation is a separate act. Withdraw that too and the
  // number has two revoked rows, then three, and the list reads as broken.
  it('collapses repeated cycles on one number to a single row', () => {
    const rows = withdrawnNumbers([
      revoked('14085550112', 'a', '2026-09-01T00:00:00Z'),
      revoked('14085550112', 'b', '2026-09-05T00:00:00Z'),
      revoked('14085550112', 'c', '2026-09-03T00:00:00Z'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.times).toBe(3);
    // The most recent invitation, not whichever came back first.
    expect(rows[0]?.invite.id).toBe('b');
  });

  // The most confusing thing this list could do: show a number as withdrawn
  // while it is sitting in "The list" above.
  it('drops a number that has since been invited again', () => {
    const rows = withdrawnNumbers([
      revoked('14085550112', 'old', '2026-09-01T00:00:00Z'),
      invite({ id: 'new', phone: '14085550112', status: 'pending' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('drops a number that is blocked, which has its own list', () => {
    const rows = withdrawnNumbers(
      [revoked('14085550112', 'old', '2026-09-01T00:00:00Z')],
      ['14085550112'],
    );
    expect(rows).toEqual([]);
  });

  it('keeps distinct numbers apart, newest first', () => {
    const rows = withdrawnNumbers([
      revoked('14085550112', 'a', '2026-09-01T00:00:00Z'),
      revoked('14085550113', 'b', '2026-09-09T00:00:00Z'),
    ]);
    expect(rows.map((r) => r.invite.phone)).toEqual(['14085550113', '14085550112']);
    expect(rows.every((r) => r.times === 1)).toBe(true);
  });

  it('says how many times, on screen, only when it is more than once', async () => {
    const user = userEvent.setup();
    api.invites = [
      revoked('14085550112', 'a', '2026-09-01T00:00:00Z'),
      revoked('14085550112', 'b', '2026-09-05T00:00:00Z'),
      revoked('14085550113', 'c', '2026-09-02T00:00:00Z'),
    ];
    renderAdmin();
    await screen.findByRole('button', { name: 'invites' });
    await user.click(screen.getByRole('button', { name: 'invites' }));

    expect(await screen.findByText(/withdrawn 2 times/)).toBeInTheDocument();
    expect(screen.getAllByText('14085550112')).toHaveLength(1);
    expect(screen.getByText('14085550113')).toBeInTheDocument();
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

    // Section renders a heading row, a subtitle, then the rows. The heading
    // sits inside a flex wrapper so a section-level action can sit beside it,
    // which is why this starts from the heading's parent.
    const rowsUnder = (title: string) =>
      screen.getByText(title).parentElement?.nextElementSibling?.nextElementSibling as HTMLElement;

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
  invitedByMemberIsAdmin: undefined,
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

  // An administrator adding a number by hand — the launch allowlist, somebody
  // met at an event — should be able to say so rather than attributing it to
  // an organization that had nothing to do with it.
  it('vouches as the club by default, sending no organization', async () => {
    await openInvites();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the list' }));
    await waitFor(() => {
      expect(api.created).toEqual([
        { phone: '(408) 555-0112', organizationId: null, claimMemberId: null, note: null },
      ]);
    });
  });

  it('sends the organization when one is chosen', async () => {
    await openInvites();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.selectOptions(screen.getByLabelText(/Vouched for by/), 'org1');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the list' }));
    await waitFor(() => {
      expect(api.created).toEqual([
        { phone: '(408) 555-0112', organizationId: 'org1', claimMemberId: null, note: null },
      ]);
    });
  });

  // The rule against this came from a policy about mentors, who cannot reach
  // this form at all and whose own insert policy still forbids them a claim.
  // An administrator can already delete any member and block any number, so
  // withholding a claim protected nothing and forced a false attribution
  // into the record of who vouched.
  it('lets the club vouch for a directory claim', async () => {
    await openInvites();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.selectOptions(screen.getByLabelText(/already in the directory/), 'seed1');

    expect(screen.getByRole('button', { name: 'Add to the list' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add to the list' }));
    await waitFor(() => {
      expect(api.created).toEqual([
        { phone: '(408) 555-0112', organizationId: null, claimMemberId: 'seed1', note: null },
      ]);
    });
  });
});

describe('who vouched, on the list', () => {
  // A member inviter used to mean a mentor and nothing else.
  it('tells an administrator apart from a mentor', () => {
    expect(
      vouchedBy(
        invite({
          invitedByOrganization: null,
          invitedByMember: 'Alfred Shaheen',
          invitedByMemberIsAdmin: true,
        }),
      ),
    ).toBe('Alfred Shaheen (admin)');
    expect(
      vouchedBy(
        invite({
          invitedByOrganization: null,
          invitedByMember: 'Todd',
          invitedByMemberIsAdmin: false,
        }),
      ),
    ).toBe('Todd (mentor)');
  });

  // A database that predates the column cannot say which, and every member
  // inviter on it is a mentor, because that was the only way in.
  it('says mentor where the view does not report it', () => {
    expect(
      vouchedBy(
        invite({
          invitedByOrganization: null,
          invitedByMember: 'Todd',
          invitedByMemberIsAdmin: undefined,
        }),
      ),
    ).toBe('Todd (mentor)');
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
