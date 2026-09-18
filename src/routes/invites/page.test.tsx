import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type * as MentorInvites from '@/routes/invites/mentor-invites';
import { MENTOR_ALLOWANCE, type MentorInvite } from '@/routes/invites/mentor-invites';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const own = vi.hoisted(() => ({ type: 'mentor', loading: false }));
const api = vi.hoisted(() => ({
  invites: [] as MentorInvite[],
  created: [] as unknown[],
  withdrawn: [] as string[],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({
    member: { id: 'me', type: own.type },
    invitedBy: null,
    loading: own.loading,
    error: null,
  }),
}));

// Partial, for the same reason the admin page's test is: `inviteState`,
// `slotsLeft` and `canWithdraw` are pure and the page should be rendering the
// real ones. Stubbing them would let this file assert its own arithmetic —
// the screen could offer a third invite and the test would still pass.
vi.mock('@/routes/invites/mentor-invites', async (importOriginal) => ({
  ...(await importOriginal<typeof MentorInvites>()),
  fetchMyInvites: () => Promise.resolve({ ok: true as const, invites: api.invites }),
  createMyInvite: (input: unknown) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.created.push(input);
    return Promise.resolve({ ok: true });
  },
  withdrawMyInvite: (id: string) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.withdrawn.push(id);
    api.invites = api.invites.map((i) => (i.id === id ? { ...i, status: 'revoked' as const } : i));
    return Promise.resolve({ ok: true });
  },
}));

const { default: InvitesPage } = await import('@/routes/invites/page');

const invite = (o: Partial<MentorInvite> = {}): MentorInvite => ({
  id: 'i1',
  phone: '14085550112',
  status: 'pending',
  note: null,
  createdAt: '2026-09-11T08:43:18Z',
  ...o,
});

function renderInvites() {
  return render(
    <MemoryRouter initialEntries={['/invites']}>
      <Routes>
        <Route path="/invites" element={<InvitesPage />} />
        <Route path="/me" element={<p>Me screen</p>} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'me', isAdmin: false, displayName: 'Todd' };
  own.type = 'mentor';
  own.loading = false;
  api.invites = [];
  api.created = [];
  api.withdrawn = [];
  api.failWith = null;
});

describe('who can open it', () => {
  it('sends a peer to Me rather than showing a form the database would refuse', async () => {
    own.type = 'peer';
    renderInvites();
    expect(await screen.findByText('Me screen')).toBeInTheDocument();
  });

  it('sends somebody who is not a member to the welcome screen', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderInvites();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });
});

describe('getting back out', () => {
  // Unlisted in the tab bar, so without this the only way back is the Me tab.
  // A Link rather than history: the label names where it goes, and on a
  // refresh or a deep link history would leave the app while still saying Me.
  it('offers a link to Me', async () => {
    renderInvites();
    const back = await screen.findByRole('link', { name: 'Me' });
    expect(back).toHaveAttribute('href', '/me');
  });
});

/** The sentence the header prints when nothing is spent. */
const allFree = new RegExp(`${MENTOR_ALLOWANCE} of your ${MENTOR_ALLOWANCE} invites are free`);

/** Enough consumed invites to fill the allowance exactly. */
const aFullAllowance = () =>
  Array.from({ length: MENTOR_ALLOWANCE }, (_, i) =>
    invite({ id: `i${i}`, status: 'consumed' as const }),
  );

describe('the allowance on screen', () => {
  it('says they are all free before a mentor has added anybody', async () => {
    renderInvites();
    expect(await screen.findByText(allFree)).toBeInTheDocument();
    expect(screen.getByText('You have not added anybody yet.')).toBeInTheDocument();
  });

  // The counting rule that matters: somebody who joined is still spending the
  // slot. A screen that freed it on arrival would offer one more than the
  // allowance and the insert policy would refuse it with no explanation the
  // member could act on.
  it('counts a member who has joined against the allowance', async () => {
    api.invites = [invite({ id: 'joined', status: 'consumed' }), invite({ id: 'waiting' })];
    renderInvites();
    expect(
      await screen.findByText(
        new RegExp(`${MENTOR_ALLOWANCE - 2} of your ${MENTOR_ALLOWANCE} invites are free`),
      ),
    ).toBeInTheDocument();
  });

  it('closes the form and says so once every slot is spent', async () => {
    api.invites = aFullAllowance();
    renderInvites();
    expect(
      await screen.findByText(new RegExp(`All ${MENTOR_ALLOWANCE} of your invites are in use`)),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('(408) 555-0112')).toBeDisabled();
  });

  it('frees the slot again once an invite is withdrawn', async () => {
    api.invites = [invite({ status: 'revoked' })];
    renderInvites();
    expect(await screen.findByText(allFree)).toBeInTheDocument();
  });
});

describe('adding a number', () => {
  it('sends the number and the mentor’s own id, and clears the form', async () => {
    const user = userEvent.setup();
    renderInvites();
    await screen.findByText(allFree);

    await user.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await user.type(screen.getByPlaceholderText('Met at rugby practice'), 'Rugby');
    await user.click(screen.getByRole('button', { name: 'Add to the list' }));

    await waitFor(() => {
      expect(api.created).toEqual([{ phone: '(408) 555-0112', memberId: 'me', note: 'Rugby' }]);
    });
    expect(screen.getByPlaceholderText('(408) 555-0112')).toHaveValue('');
  });

  it('will not submit half a phone number', async () => {
    const user = userEvent.setup();
    renderInvites();
    await screen.findByText(allFree);

    await user.type(screen.getByPlaceholderText('(408) 555-0112'), '408555');
    expect(screen.getByRole('button', { name: 'Add to the list' })).toBeDisabled();
    expect(api.created).toEqual([]);
  });

  // Whatever the database said, verbatim. The two refusals a mentor can
  // actually provoke say different things, and a rewritten sentence here
  // would flatten them back together.
  it('shows the refusal it was given', async () => {
    const user = userEvent.setup();
    api.failWith = 'That number is already on the club’s list.';
    renderInvites();
    await screen.findByText(allFree);

    await user.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await user.click(screen.getByRole('button', { name: 'Add to the list' }));

    expect(
      await screen.findByText('That number is already on the club’s list.'),
    ).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('offers Withdraw while nobody is on the number, and not after', async () => {
    api.invites = [
      invite({ id: 'waiting', phone: '14085550112' }),
      invite({ id: 'joined', phone: '14085550113', status: 'consumed' }),
    ];
    renderInvites();

    const waiting = (await screen.findByText('(408) 555-0112')).closest('li');
    const joined = screen.getByText('(408) 555-0113').closest('li');
    expect(waiting).not.toBeNull();
    expect(joined).not.toBeNull();
    expect(within(waiting as HTMLElement).getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    expect(within(joined as HTMLElement).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('keeps somebody who joined on the list rather than dropping them', async () => {
    api.invites = [invite({ status: 'consumed', note: 'Met at rugby practice' })];
    renderInvites();
    expect(await screen.findByText(/joined the club/)).toBeInTheDocument();
    expect(screen.getByText(/Met at rugby practice/)).toBeInTheDocument();
  });

  it('withdraws the row the button belongs to', async () => {
    const user = userEvent.setup();
    api.invites = [
      invite({ id: 'i1', phone: '14085550112' }),
      invite({ id: 'i2', phone: '14085550113' }),
    ];
    renderInvites();

    const row = (await screen.findByText('(408) 555-0113')).closest('li');
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => {
      expect(api.withdrawn).toEqual(['i2']);
    });
    expect(await screen.findByText('withdrawn')).toBeInTheDocument();
  });
});
