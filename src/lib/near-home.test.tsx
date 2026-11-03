import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFilterPlace } from '@/lib/filter-place';
import { useNearHome } from '@/lib/near-home';
import { calendarChanged, forgetSharedReads } from '@/lib/shared-reads';

const db = vi.hoisted(() => ({ rpc: vi.fn(), ids: ['near'] }));
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.rpc(name);
      return Promise.resolve({ data: db.ids, error: null });
    },
  }),
}));

beforeEach(() => {
  forgetSharedReads();
  db.rpc.mockClear();
  db.ids = ['near'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function read() {
  const { result, unmount } = renderHook(() => useNearHome(50));
  await waitFor(() => {
    expect(result.current.status).toBe('ready');
  });
  return { result, unmount };
}

describe('which events are near', () => {
  it('measures from a place the member chose, and from home again after', async () => {
    setFilterPlace({ label: 'Portland, OR', latitude: 45.52, longitude: -122.68, state: 'OR' });
    try {
      const { result } = renderHook(() => useNearHome(50));
      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      expect(db.rpc).toHaveBeenLastCalledWith('events_within_miles_of');
    } finally {
      setFilterPlace(null);
    }
    const { result } = renderHook(() => useNearHome(50));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(db.rpc).toHaveBeenLastCalledWith('events_within_miles');
  });

  it('asks once while the answer is fresh', async () => {
    const first = await read();
    first.unmount();
    await read();
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('asks again after the calendar changes, so a new event is not left out', async () => {
    const first = await read();
    first.unmount();
    db.ids = ['near', 'new'];
    calendarChanged();
    const { result } = renderHook(() => useNearHome(50));
    await waitFor(() => {
      expect(result.current.ids?.has('new')).toBe(true);
    });
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it('asks again after a minute, for an event added from somewhere else', async () => {
    const first = await read();
    first.unmount();
    db.ids = ['near', 'invited'];
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    const { result } = renderHook(() => useNearHome(50));
    // The last answer stands while the new one is read.
    expect(result.current.ids?.has('near')).toBe(true);
    await waitFor(() => {
      expect(result.current.ids?.has('invited')).toBe(true);
    });
  });
});
