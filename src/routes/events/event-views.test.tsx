import { render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  stats: [
    { members: 12, member_opens: '30', public_opens: 1, rsvp_clicks: '9', interested_clicks: 1 },
  ] as unknown[] | null,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      db.calls.push({ name, args });
      return Promise.resolve({ data: name === 'event_view_stats' ? db.stats : null, error: null });
    },
  }),
}));

const { recordRsvpClick, useRecordEventView } = await import('@/lib/event-views');
const { EventViewsLine } = await import('@/routes/events/event-views');

beforeEach(() => {
  db.calls = [];
  window.sessionStorage.clear();
});

describe('event views', () => {
  it('counts a view once per visit, in the app and on the public page apart', () => {
    renderHook(() => {
      useRecordEventView('e1', false);
    });
    renderHook(() => {
      useRecordEventView('e1', false);
    });
    renderHook(() => {
      useRecordEventView('e1', true);
    });
    expect(db.calls).toEqual([
      { name: 'record_event_view', args: { p_event: 'e1', p_public: false } },
      { name: 'record_event_view', args: { p_event: 'e1', p_public: true } },
    ]);
  });

  it('counts a tap on RSVP and on Interested once per visit each', () => {
    recordRsvpClick('e1', true);
    recordRsvpClick('e1', true);
    recordRsvpClick('e1', false);
    expect(db.calls).toEqual([
      { name: 'record_event_rsvp_click', args: { p_event: 'e1', p_going: true } },
      { name: 'record_event_rsvp_click', args: { p_event: 'e1', p_going: false } },
    ]);
  });

  it('shows administrators the counts', async () => {
    render(<EventViewsLine eventId="e1" allowed />);
    expect(await screen.findByText('In the app: 12 members, opened 30 times')).toBeInTheDocument();
    expect(
      screen.getByText('Public page: opened 1 time, RSVP tapped 9 times, Interested tapped 1 time'),
    ).toBeInTheDocument();
  });

  it('shows nothing, and asks nothing, to anybody else', () => {
    render(<EventViewsLine eventId="e1" allowed={false} />);
    expect(screen.queryByText(/Views/)).toBeNull();
    expect(db.calls).toEqual([]);
  });
});
