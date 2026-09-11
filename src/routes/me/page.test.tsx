import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const auth = vi.hoisted(() => ({ signedOut: 0, failWith: null as string | null }));
const own = vi.hoisted(() => ({
  member: null as Record<string, unknown> | null,
  invitedBy: null as string | null,
}));
const rsvps = vi.hoisted(() => ({ current: new Map<string, string>() }));

vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({
    member: own.member,
    invitedBy: own.invitedBy,
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/events', () => ({
  useViewerEvents: () => ({
    rsvps: rsvps.current,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () => Promise.resolve({ ok: true as const, answers: { gender: 'Female' } }),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => account.current,
  signOut: () => {
    if (auth.failWith) return Promise.resolve({ ok: false, error: auth.failWith });
    auth.signedOut += 1;
    return Promise.resolve({ ok: true });
  },
}));

const { default: MePage } = await import('@/routes/me/page');

function renderMe() {
  return render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>,
  );
}

function ownMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    displayName: 'Nicole',
    type: 'peer',
    photoPath: null,
    photoAlt: null,
    city: 'Santa Clara',
    state: 'CA',
    levelRange: 'T1–T6',
    exactLevel: 'T4',
    birthDate: '1984-06-21',
    createdAt: '2026-09-01T00:00:00.000Z',
    isAdmin: false,
    wantsToMentor: null,
    ...overrides,
  };
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  own.member = ownMember();
  own.invitedBy = 'NorCal SCI';
  rsvps.current = new Map();
  auth.signedOut = 0;
  auth.failWith = null;
});

describe('MePage', () => {
  it('says which account you are signed in as, so switching is unambiguous', () => {
    renderMe();
    expect(screen.getByRole('heading', { name: 'Nicole' })).toBeInTheDocument();
  });

  it('falls back to a plain header before the member row arrives', () => {
    own.member = null;
    renderMe();
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
  });

  it('says who vouched for you', () => {
    renderMe();
    expect(screen.getByText('Invited by NorCal SCI')).toBeInTheDocument();
  });

  it('leaves out the inviter rather than guessing when it is not known', () => {
    own.invitedBy = null;
    renderMe();
    expect(screen.queryByText(/Invited by/)).not.toBeInTheDocument();
  });

  describe('the counters', () => {
    it('count real RSVPs', () => {
      rsvps.current = new Map([
        ['a', 'going'],
        ['b', 'going'],
        ['c', 'interested'],
      ]);
      renderMe();
      expect(screen.getByRole('link', { name: /2\s*Going/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /1\s*Interested/ })).toBeInTheDocument();
    });

    it('show nothing about conversations or rooms, which are not built', () => {
      // The mock's row has three counters and two of them describe features
      // that do not exist. A zero would read as a failing product rather than
      // an unshipped one.
      renderMe();
      expect(screen.queryByText(/Conversations/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Rooms/i)).not.toBeInTheDocument();
    });
  });

  it('tells a peer they cannot invite, and why', () => {
    renderMe();
    expect(screen.getByText('Members cannot invite')).toBeInTheDocument();
  });

  it('tells a mentor they can', () => {
    own.member = ownMember({ type: 'mentor' });
    renderMe();
    expect(screen.getByText('You can invite people')).toBeInTheDocument();
  });

  it('states the rule about losing membership, rather than linking away to it', () => {
    // CONTEXT.md asks that this stay visible in the product, and there is no
    // house-rules page for a link to point at.
    renderMe();
    expect(screen.getByText(/Membership can be lost/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /house rules/i })).not.toBeInTheDocument();
  });

  it('signs out', async () => {
    renderMe();
    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    await waitFor(() => {
      expect(auth.signedOut).toBe(1);
    });
  });

  it('says what signing out does and does not do', () => {
    renderMe();
    expect(screen.getByText(/Your profile stays/)).toBeInTheDocument();
  });

  it('surfaces a failure rather than pretending it worked', async () => {
    auth.failWith = 'network is unreachable';
    renderMe();
    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(await screen.findByText('network is unreachable')).toBeInTheDocument();
  });

  it('marks an administrator, and links to the tools', () => {
    own.member = ownMember({ isAdmin: true });
    account.current = { status: 'member', userId: 'u1', isAdmin: true, displayName: 'admin' };
    renderMe();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('shows no admin link to an ordinary member', () => {
    renderMe();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('links to the survey and says how much of it is done', async () => {
    renderMe();
    const link = screen.getByRole('link', { name: /Complete your profile/ });
    expect(link).toHaveAttribute('href', '/profile');
    await waitFor(() => {
      // One of seventeen applicable questions answered.
      expect(screen.getByText('6%')).toBeInTheDocument();
    });
  });
});
