import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_FRESH_MS, toMapContents, useMapData } from '@/lib/map-data';
import { forgetSharedReads } from '@/lib/shared-reads';

interface Db {
  calls: string[];
  failing: string | null;
  answers: Record<string, unknown>;
  account: { status: string; userId: string | null; isAdmin: boolean };
}
const db = vi.hoisted(
  (): Db => ({
    calls: [],
    failing: null,
    answers: {},
    account: { status: 'member', userId: 'me', isAdmin: false },
  }),
);

vi.mock('@/lib/account', () => ({ useAccount: () => db.account }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      return Promise.resolve(
        db.failing === name
          ? { data: null, error: { message: 'permission denied', code: '42501' } }
          : { data: db.answers[name] ?? [], error: null },
      );
    },
  }),
}));

const ANSWERS = {
  map_events: [
    { id: 'e1', latitude: 38.12346, longitude: -121.76543, exact: true },
    { id: 'e2', latitude: 38.58157, longitude: -121.4944, exact: false },
  ],
  map_peer_cities: [
    {
      city: 'Sacramento',
      state: 'CA',
      latitude: 38.58157,
      longitude: -121.4944,
      member_ids: ['a', 'b'],
    },
  ],
  map_organizations: [
    {
      place_id: 'p1',
      id: 'o1',
      label: 'Main office',
      city: 'Sacramento',
      state: 'CA',
      latitude: 38.58157,
      longitude: -121.4944,
      exact: true,
    },
  ],
  map_home: [{ latitude: 38.58157, longitude: -121.4944 }],
};

beforeEach(() => {
  db.calls = [];
  db.failing = null;
  db.answers = ANSWERS;
  db.account = { status: 'member', userId: 'me', isAdmin: false };
});

describe('useMapData', () => {
  it('asks the four questions once, and the next screen reads the answer kept', async () => {
    const first = renderHook(() => useMapData());
    expect(first.result.current.status).toBe('loading');
    await waitFor(() => {
      expect(first.result.current.status).toBe('ready');
    });
    expect(db.calls.sort()).toEqual([
      'map_events',
      'map_home',
      'map_organizations',
      'map_peer_cities',
    ]);
    expect(first.result.current.events).toEqual([
      { id: 'e1', latitude: 38.12346, longitude: -121.76543, exact: true },
      { id: 'e2', latitude: 38.58157, longitude: -121.4944, exact: false },
    ]);
    expect(first.result.current.peerCities).toEqual([
      {
        city: 'Sacramento',
        state: 'CA',
        latitude: 38.58157,
        longitude: -121.4944,
        memberIds: ['a', 'b'],
      },
    ]);
    expect(first.result.current.organizations).toEqual([
      {
        placeId: 'p1',
        id: 'o1',
        label: 'Main office',
        city: 'Sacramento',
        state: 'CA',
        latitude: 38.58157,
        longitude: -121.4944,
        exact: true,
      },
    ]);
    expect(first.result.current.home).toEqual({ latitude: 38.58157, longitude: -121.4944 });

    const again = renderHook(() => useMapData());
    expect(again.result.current.status).toBe('ready');
    expect(db.calls).toHaveLength(4);
  });

  it('shares one read between two screens asking at once', async () => {
    const one = renderHook(() => useMapData());
    const two = renderHook(() => useMapData());
    await waitFor(() => {
      expect(one.result.current.status).toBe('ready');
    });
    await waitFor(() => {
      expect(two.result.current.status).toBe('ready');
    });
    expect(db.calls).toHaveLength(4);
  });

  it('reads again after sign-out', async () => {
    const first = renderHook(() => useMapData());
    await waitFor(() => {
      expect(first.result.current.status).toBe('ready');
    });
    forgetSharedReads();
    const next = renderHook(() => useMapData());
    await waitFor(() => {
      expect(next.result.current.status).toBe('ready');
    });
    expect(db.calls).toHaveLength(8);
  });

  it('says error when one question fails, and asks again on retry', async () => {
    db.failing = 'map_peer_cities';
    const { result } = renderHook(() => useMapData());
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.events).toEqual([]);
    db.failing = null;
    result.current.retry();
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.peerCities).toHaveLength(1);
  });

  it('asks nothing for somebody who is not a member', async () => {
    db.account = { status: 'signed-out', userId: null, isAdmin: false };
    const { result } = renderHook(() => useMapData());
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.home).toBeNull();
    expect(db.calls).toEqual([]);
  });
});

describe('a map kept open', () => {
  it('hands the same contents to every render until the answer changes', async () => {
    const { result, rerender } = renderHook(() => useMapData());
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    const first = result.current.contents;
    rerender();
    rerender();
    expect(result.current.contents).toBe(first);
  });

  it('reads nothing while hidden', () => {
    renderHook(() => useMapData(false));
    expect(db.calls).toEqual([]);
  });

  it('reads again behind the drawn answer when shown after a minute, without a flash', async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      const { result, rerender } = renderHook(({ active }) => useMapData(active), {
        initialProps: { active: true },
      });
      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      rerender({ active: false });
      now += MAP_FRESH_MS + 1;
      // A peer turned the map off meanwhile.
      db.answers = { ...ANSWERS, map_peer_cities: [] };
      rerender({ active: true });
      expect(result.current.status).toBe('ready');
      expect(result.current.peerCities).toHaveLength(1);
      await waitFor(() => {
        expect(result.current.peerCities).toHaveLength(0);
      });
      expect(db.calls).toHaveLength(8);
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps the drawn answer when a refresh fails', async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      const { result, rerender } = renderHook(({ active }) => useMapData(active), {
        initialProps: { active: true },
      });
      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      rerender({ active: false });
      now += MAP_FRESH_MS + 1;
      db.failing = 'map_events';
      rerender({ active: true });
      await waitFor(() => {
        expect(db.calls).toHaveLength(8);
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.events).toHaveLength(2);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('toMapContents', () => {
  it('reads an organization row from before places as its one place, at its city', () => {
    const contents = toMapContents([], [], [{ id: 'o2', latitude: 38, longitude: -121 }], []);
    expect(contents.organizations).toEqual([
      {
        placeId: 'o2',
        id: 'o2',
        label: null,
        city: '',
        state: '',
        latitude: 38,
        longitude: -121,
        exact: false,
      },
    ]);
  });

  it('leaves off a row in an unexpected shape', () => {
    const contents = toMapContents(
      [
        { id: 'e1', latitude: null, longitude: -121, exact: true },
        { id: 'e2', latitude: '38', longitude: -121, exact: false },
        { id: 'e3', latitude: 38, longitude: -121, exact: 'yes' },
      ],
      [{ city: 'Davis', state: 'CA', latitude: 38.5, longitude: -121.7, member_ids: [] }],
      [{ id: 7, latitude: 38, longitude: -121 }],
      [],
    );
    expect(contents).toEqual({
      events: [{ id: 'e3', latitude: 38, longitude: -121, exact: false }],
      peerCities: [],
      organizations: [],
      home: null,
    });
  });
});
