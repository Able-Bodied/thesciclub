import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceAsk } from '@/routes/chat/place-ask';

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me' }),
}));
vi.mock('@/lib/geocode', () => ({
  geocodeZip: (zip: string) =>
    Promise.resolve(zip === '95112' ? { city: 'San Jose', state: 'CA' } : null),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: db.row, error: null }),
        update: (values: Record<string, unknown>) => {
          db.updates.push(values);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return chain;
    },
  }),
}));

const member = (over: Record<string, unknown> = {}) => ({
  city: null,
  state: null,
  declined: [],
  show_in_browse: true,
  ...over,
});

beforeEach(() => {
  db.updates = [];
});

// The owner, 2026-11-12: a Classifieds listing shows where its author is, and
// posting one is when somebody with no city is asked for it.
describe('asking for a city in Classifieds', () => {
  it('asks only a member with no city who would show one, and saves the ZIP’s place', async () => {
    for (const over of [{ city: 'Fresno' }, { declined: ['city'] }, { show_in_browse: false }]) {
      db.row = member(over);
      const { unmount } = render(<PlaceAsk />);
      // The read lands in one turn, as the asked case below shows.
      await act(() => Promise.resolve());
      expect(screen.queryByLabelText('Where are you?')).toBeNull();
      unmount();
    }

    db.row = member();
    render(<PlaceAsk />);
    await act(() => Promise.resolve());
    await userEvent.type(screen.getByLabelText('Where are you?'), '95112');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('status')).toHaveTextContent('San Jose, CA');
    expect(db.updates).toEqual([{ zip: '95112', city: 'San Jose', state: 'CA' }]);
  });
});
