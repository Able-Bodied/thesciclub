import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AccountContext } from '@/lib/account-context';
import { blockMember } from '@/lib/blocks';
import { DIRECTORY_FRESH_MS, useBrowseMembers } from '@/lib/members';
import { directoryChanged, forgetSharedReads } from '@/lib/shared-reads';

/** One directory read shared by every screen, for one signed-in member. */

interface FakeDatabase {
  userId: string | null;
  // Who each signed-in member sees, as browse_members answers them.
  rows: Record<string, Record<string, unknown>[]>;
  reads: { userId: string | null; columns: string }[];
  fail: boolean;
}

const db = vi.hoisted(
  (): FakeDatabase => ({ userId: 'member-a', rows: {}, reads: [], fail: false }),
);

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: db.userId ? { user: { id: db.userId } } : null },
        }),
    },
    rpc: () => Promise.resolve({ error: null }),
    from: () => {
      let columns = '';
      const query = {
        select: (c: string) => {
          columns = c;
          return query;
        },
        order: () => query,
        range: () => query,
        then: (resolve: (result: unknown) => unknown) => {
          db.reads.push({ userId: db.userId, columns });
          return Promise.resolve(
            resolve(
              db.fail
                ? { data: null, error: { message: 'down' } }
                : { data: db.rows[db.userId ?? ''] ?? [], error: null },
            ),
          );
        },
      };
      return query;
    },
  }),
}));

const row = (id: string, name: string) => ({
  id,
  type: 'peer',
  display_name: name,
  state: 'CA',
  represented_organizations: [],
  mentor_organizations: [],
});

beforeEach(() => {
  db.userId = 'member-a';
  db.rows = {
    'member-a': [row('b', 'Bea'), row('c', 'Cal')],
    'member-z': [row('y', 'Yan')],
  };
  db.reads = [];
  db.fail = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loaded(use?: 'deck' | 'names') {
  const hook = renderHook(() => useBrowseMembers(use));
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });
  return hook;
}

const names = (members: { displayName: string }[]) => members.map((m) => m.displayName);

describe('the shared directory', () => {
  it('is read once for screens opened together, and drawn at once by the next', async () => {
    const peers = renderHook(() => useBrowseMembers());
    const home = renderHook(() => useBrowseMembers());
    await waitFor(() => {
      expect(peers.result.current.loading).toBe(false);
      expect(home.result.current.loading).toBe(false);
    });
    expect(db.reads).toHaveLength(1);
    expect(names(home.result.current.members)).toEqual(['Bea', 'Cal']);

    const map = await loaded();
    expect(names(map.result.current.members)).toEqual(['Bea', 'Cal']);
    expect(db.reads).toHaveLength(1);
  });

  it('serves a picker from a deck, and reads a deck only once after a picker', async () => {
    await loaded('names');
    expect(db.reads).toHaveLength(1);
    expect(db.reads[0]?.columns).not.toContain('organizations');

    await loaded();
    expect(db.reads).toHaveLength(2);
    expect(db.reads[1]?.columns).toContain('represented_organizations');

    await loaded('names');
    await loaded();
    expect(db.reads).toHaveLength(2);
  });

  it('asks only for the columns a screen draws', async () => {
    await loaded();
    const deck = db.reads[0]?.columns ?? '';
    for (const unused of ['bio', 'how_injured', 'gender', 'languages', 'self_care', 'is_seed']) {
      expect(deck.split(', ')).not.toContain(unused);
    }
  });

  it('is forgotten at sign-out: the next member reads their own', async () => {
    await loaded();
    forgetSharedReads();
    db.userId = 'member-z';
    const next = await loaded();
    expect(names(next.result.current.members)).toEqual(['Yan']);
    expect(db.reads.map((r) => r.userId)).toEqual(['member-a', 'member-z']);
  });

  it('never shows one member another member’s directory, even unforgotten', async () => {
    await loaded();
    db.userId = 'member-z';
    const next = await loaded();
    expect(names(next.result.current.members)).toEqual(['Yan']);
    expect(db.reads).toHaveLength(2);
  });

  it('shows nobody to a signed-out visitor, and does not read', async () => {
    await loaded();
    db.userId = null;
    const out = await loaded();
    expect(out.result.current.signedOut).toBe(true);
    expect(out.result.current.members).toEqual([]);
    expect(db.reads).toHaveLength(1);
  });

  it('is read again after this device blocks someone', async () => {
    await loaded();
    await act(async () => {
      await blockMember('c');
    });
    db.rows['member-a'] = [row('b', 'Bea')];
    const after = await loaded();
    expect(names(after.result.current.members)).toEqual(['Bea']);
    expect(db.reads).toHaveLength(2);
  });

  it('is read again after a change to who may be seen', async () => {
    await loaded();
    directoryChanged();
    await loaded();
    expect(db.reads).toHaveLength(2);
  });

  it('draws a kept read over a minute old and reads again behind it', async () => {
    await loaded();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + DIRECTORY_FRESH_MS + 1);
    db.rows['member-a'] = [row('b', 'Bea'), row('c', 'Cal'), row('d', 'Dee')];
    // Inside the club the guard already knows who is signed in.
    const account = { status: 'member', userId: 'member-a' } as Account;
    const later = renderHook(() => useBrowseMembers(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
      ),
    });
    expect(names(later.result.current.members)).toEqual(['Bea', 'Cal']);
    expect(later.result.current.loading).toBe(false);
    await waitFor(() => {
      expect(names(later.result.current.members)).toEqual(['Bea', 'Cal', 'Dee']);
    });
    expect(db.reads).toHaveLength(2);
  });

  it('keeps no failed read: the next screen asks again', async () => {
    db.fail = true;
    const first = await loaded();
    expect(first.result.current.error).toBeTruthy();
    db.fail = false;
    const second = await loaded();
    expect(second.result.current.error).toBeNull();
    expect(names(second.result.current.members)).toEqual(['Bea', 'Cal']);
    expect(db.reads).toHaveLength(2);
  });
});
