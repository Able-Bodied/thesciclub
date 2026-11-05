import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AccountContext } from '@/lib/account-context';
import { blockMember } from '@/lib/blocks';
import { resetAttachmentUrls } from '@/lib/chat/attachments';
import { DIRECTORY_FRESH_MS, useBrowseMembers } from '@/lib/members';
import { usePhotoUrl } from '@/lib/photos';
import {
  directoryChanged,
  FACES_FRESH_MS,
  forgetSharedReads,
  PHOTO_RECHECK_MS,
  photoBroke,
} from '@/lib/shared-reads';

/** One directory read shared by every screen, for one signed-in member. */

interface FakeDatabase {
  userId: string | null;
  // Who each signed-in member sees, as browse_members answers them.
  rows: Record<string, Record<string, unknown>[]>;
  reads: { userId: string | null; columns: string }[];
  fail: boolean;
  /** Storage files there now; any other photo path is refused at signing. */
  files: Set<string> | null;
}

const db = vi.hoisted(
  (): FakeDatabase => ({ userId: 'member-a', rows: {}, reads: [], fail: false, files: null }),
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
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((path) =>
              db.files?.has(path)
                ? { path, signedUrl: `https://signed.test/${path}`, error: null }
                : { path, signedUrl: null, error: 'Either the object does not exist' },
            ),
            error: null,
          }),
      }),
    },
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
  db.files = null;
  resetAttachmentUrls();
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
    // The block is what takes Cal out of the read.
    db.rows['member-a'] = [row('b', 'Bea')];
    await act(async () => {
      await blockMember('c');
    });
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

  it('redraws a screen already open when this device changes its own profile', async () => {
    const open = await loaded();
    db.rows['member-a'] = [row('b', 'Bea (new photo)'), row('c', 'Cal')];
    directoryChanged();
    await waitFor(() => {
      expect(names(open.result.current.members)).toEqual(['Bea (new photo)', 'Cal']);
    });
    expect(open.result.current.loading).toBe(false);
  });

  it('reads photos again behind what is shown when one will not load, once per 30 s', async () => {
    const open = await loaded();
    const now = Date.now();
    db.rows['member-a'] = [row('b', 'Bea'), { ...row('c', 'Cal'), photo_path: 'c/new.webp' }];
    photoBroke(now);
    await waitFor(() => {
      expect(open.result.current.members[1]?.photoPath).toBe('c/new.webp');
    });
    // The light read, not the deck.
    expect(db.reads.map((read) => read.columns)[1]).toBe('id, photo_path, photo_alt');
    expect(db.reads).toHaveLength(2);
    // A screen of failing faces is still one read.
    photoBroke(now + 1);
    photoBroke(now + PHOTO_RECHECK_MS - 1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(db.reads).toHaveLength(2);
    photoBroke(now + PHOTO_RECHECK_MS);
    await waitFor(() => {
      expect(db.reads).toHaveLength(3);
    });
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

  // The robots, 2026-11-04: Bea changed her photo and deleted the old file;
  // signing the old path was refused, no image erred, and initials stayed.
  it('reads again when a face is refused at signing, and draws the new photo', async () => {
    db.rows['member-a'] = [{ ...row('b', 'Bea'), photo_path: 'b/profile-old.webp' }];
    await loaded();
    db.rows['member-a'] = [{ ...row('b', 'Bea'), photo_path: 'b/profile-new.webp' }];
    db.files = new Set(['b/profile-new.webp']);
    function Face() {
      const { members } = useBrowseMembers();
      const url = usePhotoUrl(members[0]?.photoPath);
      return <span data-testid="face">{url ?? 'initials'}</span>;
    }
    render(<Face />);
    await waitFor(() => {
      expect(screen.getByTestId('face')).toHaveTextContent(
        'https://signed.test/b/profile-new.webp',
      );
    });
    expect(db.reads).toHaveLength(2);
  });

  // The robots, 2026-11-04: open screens kept an old photo for 112 s+. The
  // owner, the same day: nothing on a timer while the page stays seen.
  it('reads nothing while seen and idle, and patches a moved photo when shown again', async () => {
    const open = await loaded();
    const first = open.result.current.members;
    vi.useFakeTimers();
    const flush = () =>
      act(async () => {
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
      });
    const show = async (state: DocumentVisibilityState) => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
    };
    try {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      vi.advanceTimersByTime(5 * 60_000);
      await flush();
      expect(db.reads).toHaveLength(1);
      db.rows['member-a'] = [{ ...row('b', 'Bea'), photo_path: 'b/new.webp' }, row('c', 'Cal')];
      await show('hidden');
      await show('visible');
      expect(db.reads.map((read) => read.columns)[1]).toBe('id, photo_path, photo_alt');
      expect(open.result.current.members[0]?.photoPath).toBe('b/new.webp');
      expect(open.result.current.members[1]).toBe(first[1]);
      // Shown again within the minute: nothing.
      vi.advanceTimersByTime(FACES_FRESH_MS - 1);
      await show('hidden');
      await show('visible');
      expect(db.reads).toHaveLength(2);
      vi.advanceTimersByTime(1);
      await show('hidden');
      await show('visible');
      expect(db.reads).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
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
