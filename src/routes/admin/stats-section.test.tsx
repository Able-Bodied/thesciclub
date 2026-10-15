import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubStats } from '@/routes/admin/club-stats';

const api = vi.hoisted(() => ({
  stats: null as ClubStats | null,
  error: null as { message: string } | null,
  calls: [] as [string, unknown][],
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: { period: string }) => {
      api.calls.push([name, args]);
      const stats = api.stats ? { ...api.stats, period: args.period } : null;
      if (stats && args.period.startsWith('prev')) stats.opened = null;
      return Promise.resolve({ data: stats, error: api.error });
    },
  }),
}));

const { StatsSection } = await import('@/routes/admin/stats-section');

const week = (iso: string, o: Partial<ClubStats['weeks'][number]> = {}) => ({
  week: iso,
  joined: 0,
  questions: 0,
  replies: 0,
  messages: 0,
  rsvps: 0,
  people: 0,
  ...o,
});

const STATS: ClubStats = {
  asOf: '2026-10-13T19:00:00Z',
  period: 'all',
  members: 24,
  joined: 24,
  opened: 22,
  accounts: 29,
  signedIn: 26,
  reachedHome: 24,
  notificationsOn: 15,
  steps: {
    agree: 20,
    name: 20,
    username: 19,
    birthday: 18,
    injury: 16,
    city: 15,
    phone: 15,
    photo: 14,
  },
  stepsSince: '2026-10-16T17:00:00Z',
  profile: {
    username: 24,
    birthday: 24,
    injury: 21,
    location: 18,
    phone: 9,
    photo: 12,
    notifications: 15,
  },
  questions: 21,
  replies: 52,
  messages: 59,
  rsvps: 23,
  active: 20,
  weeks: [
    week('2026-08-24'),
    week('2026-08-31'),
    week('2026-09-07'),
    week('2026-09-14'),
    week('2026-09-21'),
    week('2026-09-28'),
    week('2026-10-05', { joined: 7, questions: 4, replies: 11, people: 9 }),
    week('2026-10-12', { joined: 2, questions: 1, replies: 3, messages: 6, rsvps: 8, people: 10 }),
  ],
};

/** The funnel, the steps and the profiles are behind a button. */
async function openDetails() {
  await userEvent.click(await screen.findByRole('button', { name: 'Onboarding details' }));
}

beforeEach(() => {
  api.stats = STATS;
  api.error = null;
  api.calls = [];
});

describe('Admin → Stats', () => {
  it('starts on all time, through the admin-only function', async () => {
    render(<StatsSection />);
    await screen.findByText('Ever signed in');
    expect(screen.getByLabelText('Period')).toHaveValue('all');
    expect(api.calls).toEqual([['admin_club_stats', { period: 'all' }]]);
  });

  it('offers every period, all time first', () => {
    render(<StatsSection />);
    const options = within(screen.getByLabelText('Period')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'All time',
      'Last 24 hours',
      'Previous 24 hours',
      'Last 7 days',
      'Previous 7 days',
      'Last 30 days',
      'Previous 30 days',
    ]);
  });

  it('asks again for the period chosen', async () => {
    render(<StatsSection />);
    await screen.findByText('Ever signed in');
    await userEvent.selectOptions(screen.getByLabelText('Period'), '7d');
    await screen.findByText('Opened the app');
    expect(api.calls.at(-1)).toEqual(['admin_club_stats', { period: '7d' }]);
    await openDetails();
    expect(screen.getByText(/Accounts made in the last 7 days/)).toBeInTheDocument();
  });

  it('says how many opened the app, out of how many members', async () => {
    render(<StatsSection />);
    const label = await screen.findByText('Ever signed in');
    const tile = within(label.parentElement ?? label);
    expect(tile.getByText('22')).toBeInTheDocument();
    expect(tile.getByText('of 24 members')).toBeInTheDocument();
  });

  // A session keeps only when it was last used: nobody can say who opened the
  // app between two moments in the past, and a guess would read as a fact.
  it('gives no count of opening the app for a previous period, and says why', async () => {
    render(<StatsSection />);
    await screen.findByText('Ever signed in');
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'prev7d');
    const label = await screen.findByText('Opened the app');
    const tile = within(label.parentElement ?? label);
    expect(tile.getByText('—')).toBeInTheDocument();
    expect(tile.getByText('Not kept for an earlier period')).toBeInTheDocument();
  });

  it('shows onboarding starts and new accounts, and keeps the rest behind a button', async () => {
    render(<StatsSection />);
    const starts = await screen.findByText('Onboarding starts');
    expect(starts.parentElement).toHaveTextContent('26');
    expect(screen.getByText('New accounts').parentElement).toHaveTextContent('29');
    const button = screen.getByRole('button', { name: 'Onboarding details' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Step by step')).toBeNull();
    expect(screen.queryByText('Reached the home screen')).toBeNull();
    expect(screen.queryByText('Added a profile picture')).toBeNull();
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Hide onboarding details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Step by step')).toBeInTheDocument();
    expect(screen.getByText('Added a profile picture')).toBeInTheDocument();
  });

  it('says where people stop on the way in', async () => {
    render(<StatsSection />);
    await openDetails();
    expect(
      await screen.findByText(/2 people signed in and stopped before Home/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/3 people filled in the join form but never pressed the link/),
    ).toBeInTheDocument();
  });

  it('gives each step of the way in as a share of the one before', async () => {
    render(<StatsSection />);
    await openDetails();
    const home = (await screen.findByText('Reached the home screen')).parentElement;
    expect(home).toHaveTextContent('24');
    expect(home).toHaveTextContent('92%');
    expect(screen.getByText('Notifications on').parentElement).toHaveTextContent('63%');
  });

  it('says how many members added each part of a profile', async () => {
    render(<StatsSection />);
    await openDetails();
    const row = (label: string) => screen.getByText(label).parentElement;
    await screen.findByText('Added a profile picture');
    expect(row('Created a username')).toHaveTextContent('24100%');
    expect(row('Added their injury or condition')).toHaveTextContent('2188%');
    expect(row('Added a phone number')).toHaveTextContent('938%');
    expect(row('Added a profile picture')).toHaveTextContent('1250%');
    expect(row('Turned on notifications')).toHaveTextContent('1563%');
    expect(screen.getByText(/Of the 24 members who joined ever/)).toBeInTheDocument();
  });

  it('says how many reached each step, of those past the invite check, and since when', async () => {
    render(<StatsSection />);
    await openDetails();
    const row = (label: string) => screen.getByText(label).parentElement;
    await screen.findByText('Got past the invite check');
    expect(row('Got past the invite check')).toHaveTextContent('20100%');
    expect(row('Injury or condition')).toHaveTextContent('1680%');
    expect(row('Profile picture')).toHaveTextContent('1470%');
    expect(screen.getByText(/Kept since October 16/)).toBeInTheDocument();
  });

  it('lists the last eight weeks newest first, this one marked as so far', async () => {
    render(<StatsSection />);
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    // The header, then eight weeks.
    expect(rows).toHaveLength(9);
    expect(rows[1]).toHaveTextContent('Oct 12');
    expect(rows[1]).toHaveTextContent('(so far)');
    expect(rows[2]).toHaveTextContent('Oct 5');
    expect(rows[8]).toHaveTextContent('Aug 24');
  });

  it('never names anybody: there is nothing in the answer to name them with', async () => {
    render(<StatsSection />);
    await screen.findByRole('table');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says so when the database refuses', async () => {
    api.stats = null;
    api.error = { message: 'Not an administrator' };
    render(<StatsSection />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
