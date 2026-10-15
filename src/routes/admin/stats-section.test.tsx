import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubStats } from '@/routes/admin/club-stats';

const api = vi.hoisted(() => ({
  stats: null as ClubStats | null,
  error: null as { message: string } | null,
  calls: [] as string[],
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      api.calls.push(name);
      return Promise.resolve({ data: api.stats, error: api.error });
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
  members: 24,
  joined7: 5,
  joined30: 12,
  opened1: 7,
  opened7: 15,
  opened30: 21,
  accounts: 29,
  signedIn: 26,
  reachedHome: 24,
  notificationsOn: 15,
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

describe('Admin → Stats', () => {
  it('asks the database once, through the admin-only function', async () => {
    api.stats = STATS;
    api.calls = [];
    render(<StatsSection />);
    await screen.findByText('Opened the app, last 7 days');
    expect(api.calls).toEqual(['admin_club_stats']);
  });

  it('says how many opened the app, out of how many members', async () => {
    api.stats = STATS;
    render(<StatsSection />);
    const label = await screen.findByText('Opened the app, last 7 days');
    const tile = within(label.parentElement ?? label);
    expect(tile.getByText('15')).toBeInTheDocument();
    expect(tile.getByText('of 24 members')).toBeInTheDocument();
  });

  it('says where people stop on the way in', async () => {
    api.stats = STATS;
    render(<StatsSection />);
    expect(
      await screen.findByText(/2 people signed in and stopped before Home/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/3 people filled in the join form but never pressed the link/),
    ).toBeInTheDocument();
  });

  it('gives each step of the way in as a share of the one before', async () => {
    api.stats = STATS;
    render(<StatsSection />);
    const home = (await screen.findByText('Reached the home screen')).parentElement;
    expect(home).toHaveTextContent('24');
    expect(home).toHaveTextContent('92%');
    expect(screen.getByText('Notifications on').parentElement).toHaveTextContent('63%');
  });

  it('lists the weeks newest first, this one marked as so far', async () => {
    api.stats = STATS;
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
    api.stats = STATS;
    render(<StatsSection />);
    await screen.findByRole('table');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says so when the database refuses', async () => {
    api.stats = null;
    api.error = { message: 'Not an administrator' };
    render(<StatsSection />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    api.error = null;
  });
});
