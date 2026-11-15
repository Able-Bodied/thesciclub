import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PauseNotifications, tomorrowMorning } from '@/routes/me/pause-notifications';

const db = vi.hoisted(() => ({ until: null as string | null, devices: 0 }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: () => Promise.resolve({ data: db.until, error: null }),
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ count: db.devices, error: null }) }),
    }),
  }),
}));

// Dates: the owner's 2026-11-13 Pause, "until tomorrow morning".
describe('tomorrowMorning', () => {
  it('is 8am the next day late at night, but this morning just after midnight', () => {
    const late = tomorrowMorning(new Date(2026, 10, 13, 23, 30));
    expect([late.getDate(), late.getHours(), late.getMinutes()]).toEqual([14, 8, 0]);
    const early = tomorrowMorning(new Date(2026, 10, 14, 0, 15));
    expect([early.getDate(), early.getHours()]).toEqual([14, 8]);
  });

  it('crosses a month end', () => {
    const next = tomorrowMorning(new Date(2026, 10, 30, 21, 0));
    expect([next.getMonth(), next.getDate(), next.getHours()]).toEqual([11, 1, 8]);
  });
});

// The owner, 2026-11-14: the pause is the member's, so it shows on every
// device where it matters, but never suggests notifications are on when none are.
describe('where Pause shows', () => {
  async function shown(deviceOn: boolean, devices: number, until: string | null = null) {
    db.devices = devices;
    db.until = until;
    const { container, unmount } = render(<PauseNotifications userId="me" deviceOn={deviceOn} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const text = container.textContent;
    unmount();
    return text;
  }

  it('shows on a device without notifications only when another of theirs has them, or a pause runs', async () => {
    expect(await shown(true, 1)).toMatch(/^Pause notifications/);
    expect(await shown(false, 0)).toBe('');
    expect(await shown(false, 2)).toMatch(
      /off on this device, but your 2 other devices still get them/,
    );
    expect(await shown(false, 0, '2026-11-20T16:00:00Z')).toMatch(
      /Paused on all your devices until/,
    );
    expect(screen.queryByRole('button', { name: 'For an hour' })).toBeNull();
  });
});
