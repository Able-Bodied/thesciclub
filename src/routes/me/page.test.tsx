import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type * as DetailsApi from '@/routes/profile/details-api';
import type { MemberDetails } from '@/routes/profile/details-api';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const auth = vi.hoisted(() => ({ signedOut: 0, failWith: null as string | null }));
const own = vi.hoisted(() => ({
  member: null as Record<string, unknown> | null,
  invitedBy: null as string | null,
}));
const rsvps = vi.hoisted(() => ({ current: new Map<string, string>() }));
const startTimes = vi.hoisted(() => ({ current: new Map<string, string>() }));

/** An ISO start time `days` from now. Negative is in the past. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const completeDetails: MemberDetails = {
  displayName: 'Dana',
  birthDate: '1990-04-02',
  exactLevel: 'C7',
  completeness: 'Incomplete',
  injuryDate: '2013-01-01',
  injuryDatePrecision: 'year',
  city: 'San Jose',
  state: 'CA',
  photoPath: 'u1/profile.jpg',
  showInBrowse: true,
};
const details = vi.hoisted(() => ({ current: null as unknown as MemberDetails }));

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
    startTimes: startTimes.current,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () => Promise.resolve({ ok: true as const, answers: { gender: 'Female' } }),
}));

// Partial: `missingDetails` and `listInWords` are pure and the page should be
// running the real ones, or this file would be asserting its own arithmetic.
vi.mock('@/routes/profile/details-api', async (importOriginal) => ({
  ...(await importOriginal<typeof DetailsApi>()),
  loadDetails: () => Promise.resolve({ ok: true as const, details: details.current }),
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
  startTimes.current = new Map();
  auth.signedOut = 0;
  auth.failWith = null;
  details.current = completeDetails;
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
      startTimes.current = new Map([
        ['a', daysFromNow(3)],
        ['b', daysFromNow(10)],
        ['c', daysFromNow(5)],
      ]);
      renderMe();
      expect(screen.getByRole('link', { name: /2\s*Going/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /1\s*Interested/ })).toBeInTheDocument();
    });

    it('count what is coming up, not what has already happened', () => {
      // The counters answer "what have I got on". One that keeps climbing as
      // events go by stops answering it.
      rsvps.current = new Map([
        ['past', 'going'],
        ['soon', 'going'],
        ['gone', 'interested'],
      ]);
      startTimes.current = new Map([
        ['past', daysFromNow(-9)],
        ['soon', daysFromNow(4)],
        ['gone', daysFromNow(-2)],
      ]);
      renderMe();
      expect(screen.getByRole('link', { name: /1\s*Going/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /0\s*Interested/ })).toBeInTheDocument();
    });

    it('does not count an RSVP whose event did not come back', () => {
      // A number that guesses is worse than one that waits.
      rsvps.current = new Map([['orphan', 'going']]);
      startTimes.current = new Map();
      renderMe();
      expect(screen.getByRole('link', { name: /0\s*Going/ })).toBeInTheDocument();
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

describe('what is still to fill in', () => {
  // Onboarding can be finished after the birthday now, so an empty photo or
  // city is the ordinary state for a while rather than an oversight. The
  // count is how somebody knows there is anything to come back for.
  it('counts the blanks on the details row', async () => {
    details.current = {
      ...completeDetails,
      photoPath: null,
      city: null,
      state: '',
    };
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  // A badge saying 3 with nothing to act on is a nag, so it names them.
  it('says which ones, in a sentence', async () => {
    details.current = { ...completeDetails, photoPath: null, city: null };
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Still to add: a photo and your city.')).toBeInTheDocument();
  });

  it('shows no count at all when there is nothing left', async () => {
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Your details')).toBeInTheDocument();
    expect(screen.queryByText(/Still to add/)).toBeNull();
  });
});
