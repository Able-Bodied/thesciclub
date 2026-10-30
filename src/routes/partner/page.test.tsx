import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type { MadeIntroduction, PartnerPerson, PartnerStats } from '@/lib/partner-hub';

/** The partner's page (20261029100000). Only the reads are stubbed. */
const state = vi.hoisted(() => ({
  account: null as Account | null,
  partner: true,
  people: [] as PartnerPerson[],
  intros: [] as MadeIntroduction[],
  statsAsked: [] as number[],
  withdrawn: [] as string[],
}));

vi.mock('@/lib/account', () => ({ useAccount: () => state.account }));
vi.mock('@/lib/club-partners', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIAmPartner: () => state.partner,
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
  fetchMyPeople: () => Promise.resolve({ ok: true, value: state.people }),
  fetchMyIntroductions: () => Promise.resolve({ ok: true, value: state.intros }),
  withdrawIntroduction: (id: string) => {
    state.withdrawn.push(id);
    state.intros = state.intros.map((i) => (i.id === id ? { ...i, status: 'withdrawn' } : i));
    return Promise.resolve({ ok: true, value: null });
  },
}));

const { default: PartnerPage } = await import('@/routes/partner/page');

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
      <MemoryRouter initialEntries={['/partner']}>
        <Routes>
          <Route path="/partner" element={<PartnerPage />} />
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
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('the trusted partner page', () => {
  it('tells anybody who is not a partner what it is for', async () => {
    state.partner = false;
    renderPage();
    expect(await screen.findByText('This page is for trusted partners.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your numbers' })).toBeNull();
  });

  it('is titled with the role and the partner’s own title, and leads to the card', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Trusted partner' })).toBeInTheDocument();
    expect(await screen.findByText('Physical therapist, SCI-FIT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Your card/ })).toHaveAttribute(
      'href',
      '/partner/card',
    );
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

  it('says how to introduce someone', async () => {
    renderPage();
    expect(
      await within(screen.getByRole('region', { name: 'My people' })).findByText(/Nobody yet/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/open their profile and choose/i).length).toBeGreaterThan(0);
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
