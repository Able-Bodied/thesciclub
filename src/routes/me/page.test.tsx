import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type * as DetailsApi from '@/routes/profile/details-api';
import type { MemberDetails } from '@/routes/profile/details-api';
import { applicableQuestions } from '@/routes/profile/questions';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const auth = vi.hoisted(() => ({ signedOut: 0, failWith: null as string | null }));
const own = vi.hoisted(() => ({
  member: null as Record<string, unknown> | null,
  invitedBy: null as string | null,
}));
const rsvps = vi.hoisted(() => ({ current: new Map<string, string>() }));
const startTimes = vi.hoisted(() => ({ current: new Map<string, string>() }));
const wroteVisibility = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const chat = vi.hoisted(() => ({
  threads: [] as { id: string }[],
  joined: new Set<string>(),
}));

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
  declined: [],
};
const details = vi.hoisted(() => ({ current: null as unknown as MemberDetails }));
const survey = vi.hoisted(() => ({
  answers: {},
  declined: new Set<string>(),
}));

vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({
    member: own.member,
    invitedBy: own.invitedBy,
    loading: false,
    error: null,
  }),
}));

// Stubbed, and they have to be: `.env.local` points at the hosted project, so
// an unmocked read in a test talks to production. What the hooks do is their
// own concern — this screen's job is to count what they return.
vi.mock('@/lib/chat/threads', () => ({
  useMyThreads: () => ({
    threads: chat.threads,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

vi.mock('@/lib/chat/rooms', () => ({
  useRoomMembership: () => ({
    joined: chat.joined,
    loading: false,
    error: null,
    toggle: () => undefined,
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

// Driven per-test, and `progressOf` is deliberately not stubbed: the page
// should be running the real arithmetic, or this file would be asserting its
// own. A complete profile is produced by declining every question, which is a
// real way to reach 100 and needs no fixture of seventeen answers.
vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () =>
    Promise.resolve({
      ok: true as const,
      answers: survey.answers,
      declined: survey.declined,
    }),
}));

// Partial: `missingDetails` and `listInWords` are pure and the page should be
// running the real ones, or this file would be asserting its own arithmetic.
vi.mock('@/routes/profile/details-api', async (importOriginal) => ({
  ...(await importOriginal<typeof DetailsApi>()),
  loadDetails: () => Promise.resolve({ ok: true as const, details: details.current }),
  setShowInBrowse: (...args: unknown[]) =>
    wroteVisibility.calls.push(args) && Promise.resolve({ ok: true as const }),
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
  wroteVisibility.calls = [];
  auth.signedOut = 0;
  auth.failWith = null;
  details.current = completeDetails;
  survey.answers = {};
  survey.declined = new Set();
  chat.threads = [];
  chat.joined = new Set();
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

    it('counts what you have been to, separately from what is ahead', () => {
      rsvps.current = new Map([
        ['went', 'going'],
        ['soon', 'going'],
        ['considered', 'interested'],
      ]);
      startTimes.current = new Map([
        ['went', daysFromNow(-9)],
        ['soon', daysFromNow(4)],
        ['considered', daysFromNow(-2)],
      ]);
      renderMe();
      expect(screen.getByRole('link', { name: /1\s*Going/ })).toBeInTheDocument();
      // Past "interested" is not a record of anything, so it counts nowhere.
      expect(screen.getByRole('link', { name: /1\s*Been to/ })).toHaveAttribute(
        'href',
        '/events?segment=been-to',
      );
    });

    it('shows "Been to" even at zero, so the row never appears to lose a counter', () => {
      // It used to hide until there was one. A counter that comes and goes is
      // indistinguishable from one that has broken — reported as missing twice
      // before that was understood.
      rsvps.current = new Map([['soon', 'going']]);
      startTimes.current = new Map([['soon', daysFromNow(4)]]);
      renderMe();
      expect(screen.getByRole('link', { name: /0\s*Been to/ })).toBeInTheDocument();
    });

    it('does not count an RSVP whose event did not come back', () => {
      // A number that guesses is worse than one that waits.
      rsvps.current = new Map([['orphan', 'going']]);
      startTimes.current = new Map();
      wroteVisibility.calls = [];
      renderMe();
      expect(screen.getByRole('link', { name: /0\s*Going/ })).toBeInTheDocument();
    });

    // These two said nothing at all until Chat shipped, because the mock's
    // numbers described features that did not exist. They can be counted now,
    // which is the rule this row has always been held to.
    it('counts the conversations and the rooms, and points each at its segment', () => {
      chat.threads = [{ id: 't1' }, { id: 't2' }];
      chat.joined = new Set(['bowel', 'sport', 'work']);
      renderMe();
      expect(screen.getByRole('link', { name: /2\s*Conversations/ })).toHaveAttribute(
        'href',
        '/chat',
      );
      expect(screen.getByRole('link', { name: /3\s*Rooms/ })).toHaveAttribute(
        'href',
        '/chat?segment=rooms',
      );
    });

    // Same argument as "Been to" above, which the owner twice reported as
    // broken when it hid itself: a counter that comes and goes is
    // indistinguishable from one that has failed. Nought conversations is a
    // true thing about a new membership.
    it('shows both at zero rather than hiding them', () => {
      renderMe();
      expect(screen.getByRole('link', { name: /0\s*Conversations/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /0\s*Rooms/ })).toBeInTheDocument();
    });

    // A group is a conversation: /chat lists both under the same rows and the
    // Direct and Groups pills are narrowings of that one list. Counting only
    // the direct ones here would disagree with the screen the number links to.
    it('counts a group as a conversation, the way the list does', () => {
      chat.threads = [{ id: 'd1' }, { id: 'g1' }];
      renderMe();
      expect(screen.getByRole('link', { name: /2\s*Conversations/ })).toBeInTheDocument();
    });
  });

  // The whole section, not just the button. A peer used to get a heading, a
  // bordered card and an icon spent on telling them about a thing that was
  // never going to happen to them, on the one screen that is about them.
  it('says nothing about invites to somebody who cannot send one', () => {
    renderMe();
    expect(screen.queryByText('Invites')).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot invite/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Your invites/ })).not.toBeInTheDocument();
  });

  it('tells a mentor they can, and offers the way in', () => {
    own.member = ownMember({ type: 'mentor' });
    renderMe();
    expect(screen.getByText('You can invite people')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Your invites/ })).toHaveAttribute('href', '/invites');
  });

  it('keeps what can end a membership reachable, without printing it', () => {
    // The owner took the paragraph off the card: it says where you stand, and
    // the four things that end a membership go in the terms of service when
    // there is one. Reachable is still the requirement — see CONTEXT.md.
    renderMe();
    expect(screen.queryByText(/Selling to members/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what can end a membership/i })).toBeInTheDocument();
  });

  it('signs out', async () => {
    renderMe();
    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    await waitFor(() => {
      expect(auth.signedOut).toBe(1);
    });
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
    survey.answers = { gender: 'Female' };
    renderMe();
    const link = screen.getByRole('link', { name: /Complete your profile/ });
    expect(link).toHaveAttribute('href', '/profile');
    await waitFor(() => {
      // One of seventeen applicable questions answered.
      expect(screen.getByText('6%')).toBeInTheDocument();
    });
  });
});

describe('the survey card', () => {
  // The owner asked for this: at 100 the ring and the number go, and the card
  // is a statement. Nothing replaces the ring — not a tick, not a full circle.
  it('drops the ring once the profile is complete', async () => {
    survey.declined = new Set(applicableQuestions({}).map((q) => q.key));
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Profile complete')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('shows the ring while there is progress left to make', async () => {
    survey.answers = {};
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Complete your profile')).toBeInTheDocument();
  });
});

describe('what is still to fill in', () => {
  // Onboarding can be finished after the birthday now, so an empty photo or
  // city is the ordinary state for a while rather than an oversight. The
  // percentage is how somebody knows how far along they are.
  it('reports how far along the details are', async () => {
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
    // Two of the five given, three blank.
    expect(await screen.findByText('40%')).toBeInTheDocument();
  });

  // The ring is progress, so it goes once there is no progress left to make.
  // "100%" is never printed on either card — a progress indicator for a
  // finished thing is just a shape, and the sentence beside it already says so.
  it('drops the ring and the percentage once the details are done', async () => {
    details.current = { ...completeDetails };
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    // Nothing under the card at all once it is done: no ring, no percentage,
    // no sentence. A name and a chevron, like the two beside it.
    await screen.findByText('Your details');
    expect(screen.queryByText(/Still to add/)).not.toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('counts a declined detail as done, so declining finishes the card', async () => {
    details.current = { ...completeDetails, photoPath: null, declined: ['photo'] };
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    await screen.findByText('Your details');
    expect(screen.queryByText(/Still to add/)).not.toBeInTheDocument();
    expect(screen.queryByText('80%')).not.toBeInTheDocument();
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

describe('being findable', () => {
  it('says plainly when a member is hidden, which nothing else on the app did', () => {
    // Somebody who hid themselves months ago and wonders why nobody has been in
    // touch had no way to find out that they did: it lived four fields down a
    // form behind a Save.
    // One word now, at the owner's request. The loudness moved to the gold
    // border and the struck-through eye rather than to a sentence.
    details.current = { ...completeDetails, showInBrowse: false };
    renderMe();
    return screen.findByText('Hidden').then((el) => {
      expect(el).toBeInTheDocument();
    });
  });

  it('offers the switch on, so being hidden is reversible from here', async () => {
    details.current = { ...completeDetails, showInBrowse: false };
    renderMe();
    const toggle = await screen.findByRole('switch', { name: /change your visibility/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(wroteVisibility.calls.at(-1)?.[1]).toBe(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('writes immediately rather than waiting for a Save that is not here', async () => {
    details.current = { ...completeDetails, showInBrowse: true };
    renderMe();
    const toggle = await screen.findByRole('switch', { name: /change your visibility/i });
    await userEvent.click(toggle);
    expect(wroteVisibility.calls).toHaveLength(1);
    expect(wroteVisibility.calls[0]?.[1]).toBe(false);
  });
});
