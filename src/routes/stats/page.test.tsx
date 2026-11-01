import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type {
  MadeIntroduction,
  OrganizationStats,
  PartnerPerson,
  PartnerStats,
} from '@/lib/partner-hub';

/** Stats & controls (20261031110000). Only the reads are stubbed. */
const state = vi.hoisted(() => ({
  account: null as Account | null,
  partner: true,
  people: [] as PartnerPerson[],
  intros: [] as MadeIntroduction[],
  statsAsked: [] as number[],
  withdrawn: [] as string[],
  orgIds: new Set<string>(),
  orgAsked: [] as [string, number][],
  orgStats: null as OrganizationStats | null,
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
  loadMentionCandidates: () =>
    Promise.resolve([
      { id: 'ana', displayName: 'Ana Ruiz', username: 'ana', photoPath: null, photoAlt: null },
      { id: 'bo', displayName: 'Bo Chan', username: 'bo', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => new Map() }));
vi.mock('@/lib/introductions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  makeIntroduction: (...args: unknown[]) => {
    state.connected.push(args);
    return Promise.resolve(
      state.connectError ? { ok: false, error: state.connectError } : { ok: true, value: 'made' },
    );
  },
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
      withMentor: 1,
    };
    return Promise.resolve({ ok: true, value: stats });
  },
  fetchOrganizationStats: (id: string, days: number) => {
    state.orgAsked.push([id, days]);
    return Promise.resolve({ ok: true, value: state.orgStats });
  },
  fetchMyPeople: () => Promise.resolve({ ok: true, value: state.people }),
  fetchMyIntroductions: () => Promise.resolve({ ok: true, value: state.intros }),
  withdrawIntroduction: (id: string) => {
    state.withdrawn.push(id);
    state.intros = state.intros.map((i) => (i.id === id ? { ...i, status: 'withdrawn' } : i));
    return Promise.resolve({ ok: true, value: null });
  },
}));

const { default: StatsPage } = await import('@/routes/stats/page');

const stats = (o: Partial<OrganizationStats> = {}): OrganizationStats => ({
  members: 12,
  joined: 3,
  left: 1,
  waiting: 0,
  byCode: 2,
  byCheckIn: 1,
  eventsHeld: 2,
  eventsAhead: 4,
  going: 8,
  checkedIn: 6,
  reviews: 5,
  rating: 4.5,
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

const intro = (o: Partial<MadeIntroduction> = {}): MadeIntroduction => ({
  id: 'i1',
  status: 'asked',
  yeses: 1,
  note: 'You are both C6 and in San Jose.',
  createdAt: '2026-10-20T12:00:00Z',
  threadId: null,
  first: { id: 'maya', name: 'Maya Ruiz', photoPath: null },
  second: { id: 'sam', name: 'Sam Lee', photoPath: null },
  ...o,
});

function renderPage() {
  return render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={['/stats']}>
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
  state.statsAsked = [];
  state.withdrawn = [];
  state.orgIds = new Set();
  state.orgAsked = [];
  state.orgStats = stats();
  state.connected = [];
  state.connectError = null;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Stats & controls', () => {
  it('tells anybody else what it is for', async () => {
    state.partner = false;
    renderPage();
    expect(
      await screen.findByText('This page is for org admins and trusted partners.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your numbers' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Connect two members' })).toBeNull();
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
    const section = screen.getByRole('region', { name: 'Your organization' });
    expect(within(section).getByText('Abilities')).toBeInTheDocument();
    expect(await within(section).findByText('12')).toBeInTheDocument();
    expect(within(section).getByText('75%')).toBeInTheDocument();
    expect(within(section).getByText('4.5')).toBeInTheDocument();
    expect(state.orgAsked).toEqual([['o1', 30]]);
    await userEvent.click(within(section).getByRole('button', { name: '90 days' }));
    expect(state.orgAsked.at(-1)).toEqual(['o1', 90]);
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

describe('connecting two members', () => {
  async function fill() {
    const section = screen.getByRole('region', { name: 'Connect two members' });
    await userEvent.type(within(section).getByLabelText('First member'), 'ana');
    await userEvent.click(await within(section).findByRole('button', { name: /Ana Ruiz/ }));
    await userEvent.type(within(section).getByLabelText('Second member'), 'bo');
    await userEvent.click(await within(section).findByRole('button', { name: /Bo Chan/ }));
    await userEvent.type(
      within(section).getByLabelText('A note to both of them'),
      'You both race.',
    );
    return section;
  }

  it('needs two members and a note, then connects them without asking', async () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Connect two members' });
    const go = within(section).getByRole('button', { name: 'Connect them' });
    expect(go).toBeDisabled();
    await fill();
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(state.connected).toEqual([['ana', 'bo', 'You both race.', false]]);
    expect(
      await within(section).findByText('Ana Ruiz and Bo Chan are connected.'),
    ).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Connect them' })).toBeDisabled();
  });

  it('never offers the same member twice', async () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Connect two members' });
    await userEvent.type(within(section).getByLabelText('First member'), 'ana');
    await userEvent.click(await within(section).findByRole('button', { name: /Ana Ruiz/ }));
    await userEvent.type(within(section).getByLabelText('Second member'), 'ana');
    expect(await within(section).findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('puts the connector in the conversation only if they tick it', async () => {
    renderPage();
    const section = await fill();
    await userEvent.click(
      within(section).getByRole('checkbox', { name: 'Join the conversation yourself' }),
    );
    await userEvent.click(within(section).getByRole('button', { name: 'Connect them' }));
    expect(state.connected[0]?.[3]).toBe(true);
  });

  it('says a refusal and keeps what was typed', async () => {
    state.connectError = 'Those two have been connected already.';
    renderPage();
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
    await userEvent.click(
      within(people).getByRole('button', { name: 'Not yet introduced to a mentor' }),
    );
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
      intro({ id: 'i2', status: 'opened', yeses: 2, threadId: 't9' }),
      intro({ id: 'i3', status: 'declined', yeses: 1 }),
    ];
    renderPage();
    const list = screen.getByRole('region', { name: 'Introductions' });
    expect(await within(list).findByText(/Waiting: 1 of 2 said yes/)).toBeInTheDocument();
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
