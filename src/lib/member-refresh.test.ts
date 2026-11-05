import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBrowseMember } from '@/lib/members';
import { FACES_FRESH_MS, photoBroke } from '@/lib/shared-reads';

/** A profile left open: its one row, read again for a changed photo. */

const db = vi.hoisted(() => {
  const row: Record<string, unknown> = { id: 'b', type: 'peer', display_name: 'Bea', state: 'CA' };
  return { row, reads: [] as string[], fail: false };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'me' } } } }),
    },
    from: () => {
      let columns = '';
      const query = {
        select: (c: string) => {
          columns = c;
          return query;
        },
        eq: () => query,
        abortSignal: () => query,
        maybeSingle: () => {
          db.reads.push(columns);
          return Promise.resolve(
            db.fail
              ? { data: null, error: { message: 'down' } }
              : { data: { ...db.row }, error: null },
          );
        },
      };
      return query;
    },
  }),
}));

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};

afterEach(() => {
  vi.useRealTimers();
  db.row = { id: 'b', type: 'peer', display_name: 'Bea', state: 'CA', photo_path: 'b/old.webp' };
  db.reads = [];
  db.fail = false;
});

describe('an open profile', () => {
  // The robots, 2026-11-04: a profile left open kept the old photo.
  it('reads only the photo again each minute, and draws a changed one', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    db.row.photo_path = 'b/old.webp';
    const open = renderHook(() => useBrowseMember('b'));
    await settle();
    const first = open.result.current.member;
    expect(first?.photoPath).toBe('b/old.webp');
    vi.advanceTimersByTime(FACES_FRESH_MS);
    await settle();
    expect(db.reads).toEqual(['*', 'id, photo_path, photo_alt']);
    // Unchanged: the same object, so nothing redraws.
    expect(open.result.current.member).toBe(first);
    db.row.photo_path = 'b/new.webp';
    vi.advanceTimersByTime(FACES_FRESH_MS);
    await settle();
    expect(open.result.current.member?.photoPath).toBe('b/new.webp');
    expect(open.result.current.member?.displayName).toBe('Bea');
  });

  it('keeps what it shows through a failed re-read after a broken photo', async () => {
    db.row.photo_path = 'b/old.webp';
    const open = renderHook(() => useBrowseMember('b'));
    await settle();
    db.fail = true;
    act(() => {
      photoBroke();
    });
    await settle();
    expect(db.reads).toHaveLength(2);
    expect(open.result.current.member?.photoPath).toBe('b/old.webp');
    expect(open.result.current.error).toBeNull();
  });
});
