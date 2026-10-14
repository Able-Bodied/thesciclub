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
  withBio: 9,
  opened1: 7,
  opened7: 15,
  opened30: 21,
  invited: 30,
  invitedWithAccount: 26,
  invitedJoined: 24,
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
      await screen.findByText(/2 people made an account and stopped before finishing/),
    ).toBeInTheDocument();
    expect(screen.getByText(/4 invites with no account yet/)).toBeInTheDocument();
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
