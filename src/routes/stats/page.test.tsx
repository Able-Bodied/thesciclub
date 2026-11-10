import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type {
  HeldEvent,
  MadeConnection,
  OrganizationStats,
  OrganizationWeek,
  PartnerPerson,
  PartnerStats,
} from '@/lib/partner-hub';

/** Stats & controls (20261031110000). Only the reads are stubbed. */
const state = vi.hoisted(() => ({
  account: null as Account | null,
  partner: true,
  people: [] as PartnerPerson[],
  intros: [] as MadeConnection[],
  groups: [] as { id: string; name: string; members: number; mine: boolean; started: boolean }[],
  statsAsked: [] as number[],
  withdrawn: [] as string[],
  orgIds: new Set<string>(),
  orgAsked: [] as [string, number][],
  orgStats: null as OrganizationStats | null,
  orgEvents: [] as HeldEvent[],
  eventsAsked: [] as [string, number][],
  orgWeeks: [] as OrganizationWeek[],
  mentorStats: { withMentor: 1, couldHaveMentor: 4, daysToMentor: null as number | null },
  connected: [] as unknown[][],
  connectError: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => state.account }));
vi.mock('@/lib/club-partners', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIAmPartner: () => state.partner,
  useICanConnect: () => state.partner,
}));
vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: state.orgIds, loading: false }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: [
      { id: 'o2', name: 'Zed Club' },
      { id: 'o1', name: 'Abilities' },
    ],
    byId: new Map(),
    loading: false,
  }),
}));
vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadMemberChoices: () =>
    Promise.resolve([
      { id: 'ana', displayName: 'Ana Ruiz', username: 'ana', photoPath: null, photoAlt: null },
      { id: 'bo', displayName: 'Bo Chan', username: 'bo', photoPath: null, photoAlt: null },
      { id: 'cy', displayName: 'Cy Park', username: 'cy', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => new Map() }));
vi.mock('@/lib/introductions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connectMembers: (input: unknown) => {
    state.connected.push([input]);
    return Promise.resolve(
      state.connectError ? { ok: false, error: state.connectError } : { ok: true, value: 'made' },
    );
  },
  fetchConnectionGroups: () => Promise.resolve({ ok: true, value: state.groups }),
}));
// Their own tests are event-notices.test.tsx; here, nothing to show.
vi.mock('@/lib/event-notices', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOrganizationPeople: () => Promise.resolve({ ok: true, value: [] }),
  fetchEventNotices: () => Promise.resolve({ ok: true, value: [] }),
  fetchNotifiesMembers: () => Promise.resolve({ ok: true, value: false }),
}));
vi.mock('@/lib/partner-hub', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMyPartnerCard: () =>
    Promise.resolve({
      ok: true,
      value: { title: 'Physical therapist, SCI-FIT', heading: null, body: null },
    }),
  fetchPartnerStats: (days: number) => {
    state.statsAsked.push(days);
    const stats: PartnerStats = {
      invited: days,
      joined: 3,
      active: 2,
      introductions: 4,
      opened: 1,
      ...state.mentorStats,
    };
    return Promise.resolve({ ok: true, value: stats });
  },
  fetchOrganizationStats: (id: string, days: number) => {
    state.orgAsked.push([id, days]);
    return Promise.resolve({ ok: true, value: state.orgStats });
  },
  fetchOrganizationEvents: (id: string, days: number) => {
    state.eventsAsked.push([id, days]);
    return Promise.resolve({ ok: true, value: state.orgEvents });
  },
  fetchOrganizationWeeks: () => Promise.resolve({ ok: true, value: state.orgWeeks }),
  fetchMyPeople: () => Promise.resolve({ ok: true, value: state.people }),
  fetchMyConnections: () => Promise.resolve({ ok: true, value: state.intros }),
  withdrawIntroduction: (id: string) => {
    state.withdrawn.push(id);
    state.intros = state.intros.map((i) => (i.id === id ? { ...i, status: 'withdrawn' } : i));
    return Promise.resolve({ ok: true, value: null });
  },
}));

const { daysLabel, default: StatsPage, filterPeople } = await import('@/routes/stats/page');

const stats = (o: Partial<OrganizationStats> = {}): OrganizationStats => ({
  members: 12,
  joined: 3,
  waiting: 0,
  eventsHeld: 2,
  going: 8,
  checkedIn: 7,
  saidGoingAndCame: 6,
  firstTimers: 3,
  cameBack: 2,
  reviews: 5,
  rating: 4.5,
  ...o,
});

const held = (o: Partial<HeldEvent> = {}): HeldEvent => ({
  id: 'e1',
  title: 'Tuesday Ride',
  startTime: '2026-10-22T01:00:00Z',
  timezone: 'America/Los_Angeles',
  going: 5,
  checkedIn: 5,
  saidGoingAndCame: 4,
  ...o,
});

const member = (o: Partial<PartnerPerson & { kind: 'member' }> = {}): PartnerPerson => ({
  kind: 'member',
  memberId: 'sam',
  displayName: 'Sam Lee',
  photoPath: null,
  memberType: 'peer',
  invited: true,
  invitedAt: '2026-10-01T00:00:00Z',
  joinedAt: '2026-10-02T12:00:00Z',
  profileDone: false,
  introducedToMentor: false,
  introductions: 0,
  ...o,
});

const intro = (o: Partial<MadeConnection> = {}): MadeConnection => ({
  id: 'i1',
  status: 'asked',
  note: 'You are both C6 and in San Jose.',
  createdAt: '2026-10-20T12:00:00Z',
  threadId: null,
  groupName: null,
  intoGroup: false,
  people: [
    { id: 'maya', name: 'Maya Ruiz', photoPath: null },
    { id: 'sam', name: 'Sam Lee', photoPath: null },
  ],
  ...o,
});

function renderPage(tab?: string) {
  return render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={[tab ? `/stats?tab=${tab}` : '/stats']}>
        <Routes>
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </MemoryRouter>
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  state.account = { status: 'member', userId: 'bobby', isAdmin: false, displayName: 'Bobby' };
  state.partner = true;
  state.people = [];
  state.intros = [];
  state.groups = [];
  state.statsAsked = [];
  state.withdrawn = [];
  state.orgIds = new Set();
  state.orgAsked = [];
  state.orgStats = stats();
  state.orgEvents = [];
  state.eventsAsked = [];
  state.orgWeeks = [];
  state.mentorStats = { withMentor: 1, couldHaveMentor: 4, daysToMentor: 3.6 };
  state.connected = [];
  state.connectError = null;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Stats & controls', () => {
  it('tells anybody else what it is for', async () => {
    state.partner = false;
    renderPage();
    expect(
      await screen.findByText('This page is for org admins and verified professionals.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your numbers' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Connect members' })).toBeNull();
  });

  it('shows a partner’s title, and no card, QR code or invite links', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Stats & controls' })).toBeInTheDocument();
    expect(await screen.findByText('Physical therapist, SCI-FIT')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Your card/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /QR code/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Invite by email/ })).toBeNull();
  });
});

describe('your organization', () => {
  it('is left out for a partner with no organization', () => {
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Your organization' })).toBeNull();
    expect(state.orgAsked).toEqual([]);
  });

  it('shows an org admin their organization’s numbers, for the period chosen', async () => {
    state.orgIds = new Set(['o1']);
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Abilities' })).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Your organization' });
    expect(await within(section).findByText('12')).toBeInTheDocument();
    expect(within(section).getByText('75%')).toBeInTheDocument();
    expect(within(section).getByText('4.5')).toBeInTheDocument();
    expect(state.orgAsked).toEqual([['o1', 30]]);
    await userEvent.click(within(section).getByRole('button', { name: '90 days' }));
    expect(state.orgAsked.at(-1)).toEqual(['o1', 90]);
  });

  it('shows only the numbers that were kept', async () => {
    state.orgIds = new Set(['o1']);
    renderPage();
    const section = screen.getByRole('region', { name: 'Your organization' });
    await within(section).findByText('12');
    expect(
      within(section)
        .getAllByRole('term')
        .map((tile) => tile.textContent),
    ).toEqual([
      'Members',
      'New members',
      'Events held',
      'Checked in',
      'Turnout',
      'First-timers',
      'Came back',
      'Reviews',
      'Average rating',
    ]);
  });

  it('leads to whoever is waiting, on the organization’s page', async () => {
    state.orgIds = new Set(['o1']);
    state.orgStats = stats({ waiting: 2 });
    renderPage();
    expect(
      await screen.findByRole('link', { name: 'Review 2 waiting to join Abilities' }),
    ).toHaveAttribute('href', '/events/organizations/o1');
  });

  it('asks which, for an administrator or an org admin of several', async () => {
    state.account = { status: 'member', userId: 'bobby', isAdmin: true, displayName: 'Bobby' };
    state.orgIds = new Set(['o2']);
    renderPage();
    const field = screen.getByRole('combobox', { name: 'Organization' });
    // Their own first, though another comes earlier by name.
    expect(field).toHaveValue('o2');
    await userEvent.selectOptions(field, 'o1');
    await waitFor(() => {
      expect(state.orgAsked.at(-1)).toEqual(['o1', 30]);
    });
  });

  it('says no turnout, rather than a wrong one, with nobody going', async () => {
    state.orgIds = new Set(['o1']);
    state.orgStats = stats({ going: 0, checkedIn: 0, rating: null });
    renderPage();
    const section = screen.getByRole('region', { name: 'Your organization' });
    expect(await within(section).findByText('12')).toBeInTheDocument();
    expect(within(section).getAllByText('–')).toHaveLength(2);
  });
});

describe('the events behind the numbers', () => {
  beforeEach(() => {
    state.orgIds = new Set(['o1']);
  });

  it('lists each event held with its own numbers, and opens it', async () => {
    state.orgEvents = [held()];
    renderPage('events');
    const link = await screen.findByRole('link', { name: /Tuesday Ride/ });
    expect(link).toHaveAttribute('href', '/events/e1');
    expect(link).toHaveTextContent('5 going · 5 checked in · 80% turnout');
    // The evening of the 21st where it happened, whatever the reader's clock.
    expect(link).toHaveTextContent('Oct 21, 2026');
  });

  it('counts turnout by who said Going, so a walk-in cannot pass 100%', async () => {
    state.orgEvents = [held({ going: 1, checkedIn: 3, saidGoingAndCame: 1 })];
    renderPage('events');
    expect(await screen.findByRole('link', { name: /Tuesday Ride/ })).toHaveTextContent(
      '100% turnout',
    );
  });

  it('gives no turnout for an event nobody said Going to', async () => {
    state.orgEvents = [held({ going: 0, checkedIn: 2, saidGoingAndCame: 0 })];
    renderPage('events');
    const link = await screen.findByRole('link', { name: /Tuesday Ride/ });
    expect(link).toHaveTextContent('0 going · 2 checked in');
    expect(link).not.toHaveTextContent('turnout');
  });

  it('says so when none were held', async () => {
    renderPage('events');
    expect(await screen.findByText('No events held in this period.')).toBeInTheDocument();
  });

  it('follows the period, down to the past 24 hours', async () => {
    renderPage('events');
    const section = screen.getByRole('region', { name: 'Events held' });
    expect(state.eventsAsked).toEqual([['o1', 30]]);
    await userEvent.click(within(section).getByRole('button', { name: '24 hours' }));
    expect(state.eventsAsked.at(-1)).toEqual(['o1', 1]);
    // One period for the organization's tabs.
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(state.orgAsked.at(-1)).toEqual(['o1', 1]);
  });

  it('shows ten, then the rest on a press', async () => {
    state.orgEvents = Array.from({ length: 12 }, (_, i) =>
      held({ id: `e${String(i)}`, title: `Ride ${String(i)}` }),
    );
    renderPage('events');
    expect(await screen.findAllByRole('link', { name: /^Ride/ })).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Show all 12' }));
    expect(screen.getAllByRole('link', { name: /^Ride/ })).toHaveLength(12);
  });
});

describe('the last eight weeks', () => {
  const week = (o: Partial<OrganizationWeek> = {}): OrganizationWeek => ({
    week: '2026-10-26',
    members: 12,
    joined: 2,
    events: 1,
    checkedIn: 9,
    going: 8,
    saidGoingAndCame: 6,
    ...o,
  });

  it('shows each week, newest first, and says which is still going', async () => {
    state.orgIds = new Set(['o1']);
    state.orgWeeks = [week(), week({ week: '2026-10-19', going: 0, saidGoingAndCame: 0 })];
    renderPage();
    const table = await screen.findByRole('table', { name: /last eight weeks/ });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Oct 26 (so far)');
    expect(rows[1]).toHaveTextContent('75%');
    expect(rows[2]).toHaveTextContent('Oct 19');
    expect(rows[2]).not.toHaveTextContent('so far');
    expect(rows[2]).toHaveTextContent('–');
  });

  it('is left out for a partner with no organization', () => {
    renderPage();
    expect(screen.queryByRole('table', { name: /last eight weeks/ })).toBeNull();
  });
});

describe('a mentor for your people', () => {
  it('says what share of them have one, and how soon', async () => {
    renderPage();
    const numbers = screen.getByRole('region', { name: 'Your numbers' });
    expect(
      await within(numbers).findByText('25% of your people, at any time.'),
    ).toBeInTheDocument();
    expect(within(numbers).getByText('Time to a mentor').nextElementSibling).toHaveTextContent(
      '4 days',
    );
  });

  it('gives no share or time with nobody to count', async () => {
    state.mentorStats = { withMentor: 0, couldHaveMentor: 0, daysToMentor: null };
    renderPage();
    const numbers = screen.getByRole('region', { name: 'Your numbers' });
    expect(await within(numbers).findByText('Of your people, at any time.')).toBeInTheDocument();
    expect(within(numbers).getByText('Time to a mentor').nextElementSibling).toHaveTextContent('–');
  });

  it('words a time under a day, and one day', () => {
    expect(daysLabel(0.4)).toBe('Under a day');
    expect(daysLabel(1.2)).toBe('1 day');
  });
});

// The owner, 2026-11-04: in tabs, for a phone.
describe('the tabs', () => {
  const tabs = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

  it('puts an org admin’s organization first, then connecting, then their own numbers', async () => {
    state.orgIds = new Set(['o1']);
    renderPage();
    expect(tabs()).toEqual(['Overview', 'People', 'Events', 'Connect', 'Your numbers']);
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connect members' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Connect' }));
    expect(screen.getByRole('heading', { name: 'Connect members' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your organization' })).toBeNull();
  });

  it('gives a partner with no organization only their numbers and connecting', () => {
    renderPage();
    expect(tabs()).toEqual(['Your numbers', 'Connect']);
    expect(screen.getByRole('heading', { name: 'Your numbers' })).toBeInTheDocument();
  });

  it('keeps the organization chosen from tab to tab', async () => {
    state.account = { status: 'member', userId: 'bobby', isAdmin: true, displayName: 'Bobby' };
    state.orgIds = new Set(['o2']);
    renderPage();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Organization' }), 'o1');
    await userEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByRole('combobox', { name: 'Organization' })).toHaveValue('o1');
    await waitFor(() => {
      expect(state.eventsAsked.at(-1)).toEqual(['o1', 30]);
    });
  });

  it('opens on an organization tab named in the address only for an org admin', () => {
    renderPage('events');
    expect(screen.getByRole('tab', { name: 'Your numbers', selected: true })).toBeInTheDocument();
  });
});

describe('connecting members', () => {
  async function add(section: HTMLElement, typed: string, name: RegExp) {
    await userEvent.type(within(section).getByLabelText('Who are you introducing?'), typed);
    await userEvent.click(await within(section).findByRole('button', { name }));
  }

  async function fill() {
    const section = screen.getByRole('region', { name: 'Connect members' });
    await add(section, 'ana', /Ana Ruiz/);
    await add(section, 'bo', /Bo Chan/);
    await userEvent.type(
      within(section).getByLabelText('A note to both of them'),
      'You both race.',
    );
    expect(within(section).getByText('Name the group.')).toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText('Group name'), 'Racers');
    return section;
  }

  it('needs two people and a note, says what is missing, then connects them', async () => {
    renderPage('connect');
    const section = screen.getByRole('region', { name: 'Connect members' });
    expect(within(section).getByRole('button', { name: 'Connect them' })).toBeDisabled();
    expect(within(section).getByText('Choose at least two people.')).toBeInTheDocument();
    await fill();
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(state.connected).toEqual([
      [
        {
          people: ['ana', 'bo'],
          note: 'You both race.',
          join: false,
          groupId: null,
          name: 'Racers',
          copy: false,
        },
      ],
    ]);
    expect(
      await within(section).findByText('Ana Ruiz and Bo Chan are connected in “Racers”.'),
    ).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Connect them' })).toBeDisabled();
  });

  it('connects three or more in a group they name', async () => {
    renderPage('connect');
    const section = await fill();
    await add(section, 'cy', /Cy Park/);
    expect(within(section).getByLabelText('A note to everyone')).toHaveValue('You both race.');
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(state.connected[0]?.[0]).toMatchObject({ people: ['ana', 'bo', 'cy'], name: 'Racers' });
    expect(
      await within(section).findByText('Ana Ruiz, Bo Chan and Cy Park are connected in “Racers”.'),
    ).toBeInTheDocument();
  });

  it('never offers the same member twice, and a chosen one can be taken off', async () => {
    renderPage('connect');
    const section = screen.getByRole('region', { name: 'Connect members' });
    await add(section, 'ana', /Ana Ruiz/);
    await userEvent.type(within(section).getByLabelText('Who are you introducing?'), 'ana');
    expect(await within(section).findByText('Nobody matches that.')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Remove Ana Ruiz' }));
    expect(within(section).queryByRole('list', { name: 'Chosen' })).toBeNull();
  });

  it('adds one person to a group they have', async () => {
    state.groups = [
      { id: 'g1', name: 'Saturday riders', members: 4, mine: false, started: true },
      { id: 'g2', name: 'Tuesday swimmers', members: 6, mine: true, started: false },
    ];
    renderPage('connect');
    const section = screen.getByRole('region', { name: 'Connect members' });
    await add(section, 'cy', /Cy Park/);
    await userEvent.click(within(section).getByRole('radio', { name: /Existing group/ }));
    expect(within(section).getByText('Choose a group.')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('radio', { name: /Tuesday swimmers/ }));
    // A new group with its members is the default; adding into it is chosen.
    await userEvent.click(within(section).getByRole('radio', { name: /Add them to this group/ }));
    // Already in it: nothing to join.
    expect(
      within(section).queryByRole('checkbox', { name: 'Join the conversation yourself' }),
    ).toBeNull();
    await userEvent.type(within(section).getByLabelText('A note to everyone'), 'Cy swims too.');
    await userEvent.click(within(section).getByRole('button', { name: 'Add to the group' }));
    expect(state.connected[0]?.[0]).toMatchObject({ people: ['cy'], groupId: 'g2', join: false });
    expect(
      await within(section).findByText('Cy Park was added to “Tuesday swimmers”.'),
    ).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute(
      'href',
      '/chat/t/made',
    );
  });

  it('says when there are no groups yet', async () => {
    renderPage('connect');
    const section = screen.getByRole('region', { name: 'Connect members' });
    await userEvent.click(within(section).getByRole('radio', { name: /Existing group/ }));
    expect(await within(section).findByText(/You have no groups yet/)).toBeInTheDocument();
  });

  it('puts the connector in the conversation only if they tick it', async () => {
    renderPage('connect');
    const section = await fill();
    await userEvent.click(
      within(section).getByRole('checkbox', { name: 'Join the conversation yourself' }),
    );
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(state.connected[0]?.[0]).toMatchObject({ join: true });
  });

  it('says a refusal and keeps what was typed', async () => {
    state.connectError = 'Those two have been connected already.';
    renderPage('connect');
    const section = await fill();
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent(state.connectError);
    expect(within(section).getByLabelText('A note to both of them')).toHaveValue('You both race.');
  });
});

describe('your numbers', () => {
  it('reads the last 30 days, then the period chosen', async () => {
    renderPage();
    const numbers = screen.getByRole('region', { name: 'Your numbers' });
    await waitFor(() => {
      expect(within(numbers).getByText('Invited').nextElementSibling).toHaveTextContent('30');
    });
    expect(within(numbers).getByText(/Not messages/)).toBeInTheDocument();
    await userEvent.click(within(numbers).getByRole('button', { name: 'A year' }));
    expect(state.statsAsked).toContain(365);
    await waitFor(() => {
      expect(within(numbers).getByText('Invited').nextElementSibling).toHaveTextContent('365');
    });
  });
});

describe('finding who needs following up', () => {
  const now = new Date('2026-10-31T12:00:00Z').getTime();
  const waiting = (invitedAt: string | null): PartnerPerson => ({
    kind: 'pending',
    inviteId: invitedAt,
    email: 'a@b.test',
    invitedAt,
  });

  it('finds invites still waiting after seven days, and no sooner', () => {
    const late = waiting('2026-10-24T12:00:00Z');
    const recent = waiting('2026-10-24T12:00:01Z');
    expect(filterPeople([late, recent, waiting(null), member()], 'overdue', now)).toEqual([late]);
  });

  it('finds who joined and has not finished their profile', () => {
    const unfinished = member({ memberId: 'a', profileDone: false });
    const finished = member({ memberId: 'b', profileDone: true });
    expect(filterPeople([unfinished, finished, waiting(null)], 'no-profile', now)).toEqual([
      unfinished,
    ]);
  });
});

describe('my people', () => {
  it('links each to their profile with what they have done, and a waiting invite to Invites', async () => {
    state.people = [
      member({ profileDone: true, introductions: 2 }),
      {
        kind: 'pending',
        inviteId: 'v1',
        email: 'new@example.com',
        invitedAt: '2026-10-25T18:00:00Z',
      },
    ];
    renderPage();
    const people = screen.getByRole('region', { name: 'My people' });
    const sam = await within(people).findByRole('link', { name: /Sam Lee/ });
    expect(sam).toHaveAttribute('href', '/peers/sam');
    expect(within(sam).getByText(/Joined Oct 2, 2026/)).toBeInTheDocument();
    expect(within(sam).getByText(/Profile finished/)).toBeInTheDocument();
    expect(within(sam).getByText(/No mentor yet/)).toBeInTheDocument();
    expect(within(sam).getByText(/2 introductions/)).toBeInTheDocument();
    expect(within(people).getByText('new@example.com')).toBeInTheDocument();
    expect(within(people).getByText(/Invited Oct 25, 2026/)).toBeInTheDocument();
    expect(within(people).getByRole('link', { name: 'Resend in Invites' })).toHaveAttribute(
      'href',
      '/invites',
    );
  });

  it('shows only who has no mentor yet, or only who has still to join', async () => {
    state.people = [
      member(),
      member({ memberId: 'ana', displayName: 'Ana Cruz', introducedToMentor: true }),
      member({ memberId: 'mo', displayName: 'Mo Mentor', memberType: 'mentor' }),
      { kind: 'pending', inviteId: 'v1', email: 'new@example.com', invitedAt: null },
    ];
    renderPage();
    const people = screen.getByRole('region', { name: 'My people' });
    await within(people).findByText('Ana Cruz');
    await userEvent.click(within(people).getByRole('button', { name: 'No mentor yet' }));
    expect(within(people).getByText('Sam Lee')).toBeInTheDocument();
    expect(within(people).queryByText('Ana Cruz')).toBeNull();
    expect(within(people).queryByText(/Mo Mentor/)).toBeNull();
    expect(within(people).queryByText('new@example.com')).toBeNull();
    await userEvent.click(within(people).getByRole('button', { name: 'Still to join' }));
    expect(within(people).getByText('new@example.com')).toBeInTheDocument();
    expect(within(people).queryByText('Sam Lee')).toBeNull();
  });

  it('says a profile can connect someone too', async () => {
    renderPage();
    expect(
      await within(screen.getByRole('region', { name: 'My people' })).findByText(/Nobody yet/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/connect someone from their profile/i).length).toBeGreaterThan(0);
  });
});

describe('introductions', () => {
  it('says how far each has got, opens the conversation, and withdraws one waiting', async () => {
    state.intros = [
      intro(),
      intro({ id: 'i2', status: 'opened', threadId: 't9' }),
      intro({ id: 'i3', status: 'declined' }),
      intro({
        id: 'c1',
        status: 'opened',
        groupName: 'Saturday riders',
        intoGroup: true,
        people: [{ id: 'cy', name: 'Cy Park', photoPath: null }],
      }),
      intro({
        id: 'c2',
        status: 'opened',
        groupName: 'Racers',
        people: [
          { id: 'ana', name: 'Ana Ruiz', photoPath: null },
          { id: 'bo', name: 'Bo Chan', photoPath: null },
          { id: 'cy', name: 'Cy Park', photoPath: null },
        ],
      }),
    ];
    renderPage('connect');
    const list = screen.getByRole('region', { name: 'Introductions' });
    expect(await within(list).findByText(/Waiting for both to answer/)).toBeInTheDocument();
    expect(within(list).getByText(/Added to “Saturday riders”/)).toBeInTheDocument();
    expect(within(list).getByText(/New group “Racers”/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Bo Chan' })).toHaveAttribute(
      'href',
      '/peers/bo',
    );
    expect(within(list).getByText(/Didn’t go ahead/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute(
      'href',
      '/chat/t/t9',
    );
    // Only the one still waiting can be withdrawn.
    expect(within(list).getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    await userEvent.click(within(list).getByRole('button', { name: 'Withdraw' }));
    expect(state.withdrawn).toEqual(['i1']);
    expect(await within(list).findByText(/You withdrew it/)).toBeInTheDocument();
  });
});
