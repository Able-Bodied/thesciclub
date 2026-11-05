import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Authors from '@/lib/chat/authors';

/**
 * Only the supabase client is stubbed, narrowly: `getSupabase` and nothing
 * else in the module under test. A `vi.mock` of the whole module would stub
 * the mapping this file exists to check, and the test would assert its own
 * fixture back.
 */

const rows = [
  {
    id: 'a',
    display_name: 'Nicole Ruiz',
    photo_path: 'seed/a.webp',
    photo_alt: null,
    avatar_color: null,
    level_range: 'T1–T6',
    exact_level: 'T4',
    is_admin: false,
    has_profile: true,
  },
  {
    id: 'b',
    display_name: 'Jake Miller',
    photo_path: null,
    photo_alt: null,
    avatar_color: null,
    level_range: 'C5–C8',
    exact_level: null,
    is_admin: false,
    // Turned themselves off the directory. Still an author.
    has_profile: false,
  },
];

const asked: string[][] = [];

/**
 * A fresh copy of the module with the client stubbed. Fresh because the cache
 * the module keeps is module-level — the thing under test in two of the cases
 * below — so a copy shared between tests would carry one test's rows into the
 * next.
 */
async function loadWithClient(
  data: typeof rows,
  error: { message: string } | null = null,
): Promise<typeof Authors> {
  asked.length = 0;
  vi.resetModules();
  vi.doMock('@/lib/supabase', () => ({
    getSupabase: () => ({
      from: () => ({
        select: () => ({
          in: (_column: string, ids: string[]) => {
            asked.push(ids);
            return Promise.resolve({ data, error });
          },
        }),
      }),
    }),
  }));
  return import('@/lib/chat/authors');
}

afterEach(() => {
  vi.doUnmock('@/lib/supabase');
  vi.resetModules();
});

describe('fetchChatAuthors', () => {
  it('prefers the exact level and falls back to the range', async () => {
    const { fetchChatAuthors } = await loadWithClient(rows);
    const byId = await fetchChatAuthors(['a', 'b']);
    expect(byId.get('a')?.level).toBe('T4');
    expect(byId.get('b')?.level).toBe('C5–C8');
  });

  // The whole reason chat_authors exists rather than browse_members: somebody
  // who hid themselves from the deck has not unwritten what they wrote.
  it('names a member who is not in the directory, and says not to link them', async () => {
    const { fetchChatAuthors } = await loadWithClient(rows);
    const byId = await fetchChatAuthors(['a', 'b']);
    expect(byId.get('b')?.displayName).toBe('Jake Miller');
    expect(byId.get('b')?.hasProfile).toBe(false);
    expect(byId.get('a')?.hasProfile).toBe(true);
  });

  it('asks for each id once, however often it is wanted', async () => {
    const { fetchChatAuthors } = await loadWithClient(rows);
    await fetchChatAuthors(['a', 'b', 'a']);
    await fetchChatAuthors(['a', 'b']);
    expect(asked).toEqual([['a', 'b']]);
  });

  it('does not ask again for an id the view had no row for', async () => {
    const { fetchChatAuthors } = await loadWithClient([]);
    await fetchChatAuthors(['gone']);
    await fetchChatAuthors(['gone']);
    expect(asked).toEqual([['gone']]);
  });

  // A failed read must not be cached as "no such member", or a moment of bad
  // signal turns a whole thread into Deleted member for the rest of the session.
  it('tries again after a failed read', async () => {
    const { fetchChatAuthors } = await loadWithClient([], { message: 'network' });
    await fetchChatAuthors(['a']);
    await fetchChatAuthors(['a']);
    expect(asked).toEqual([['a'], ['a']]);
  });

  // The escape hatch the tests in other files need: without it one file's
  // fixtures are the next file's authors, which is the leak this project has
  // already had with Testing Library renders.
  it('asks again after the cache is reset', async () => {
    const { fetchChatAuthors, resetChatAuthors } = await loadWithClient(rows);
    await fetchChatAuthors(['a']);
    resetChatAuthors();
    await fetchChatAuthors(['a']);
    expect(asked).toEqual([['a'], ['a']]);
  });

  // A changed photo: the old file is gone, so the kept path would draw broken.
  it('reads kept authors again after a photo fails or this device changes its profile', async () => {
    const data = rows.map((row) => ({ ...row }));
    const { fetchChatAuthors } = await loadWithClient(data);
    const reads = await import('@/lib/shared-reads');
    await fetchChatAuthors(['a', 'b']);
    Object.assign(data[0] ?? {}, { photo_path: 'a/profile-new.webp' });
    data.pop(); // b is now hidden from the reader
    reads.photoBroke();
    const after = await fetchChatAuthors(['a', 'b']);
    expect(asked).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
    expect(after.get('a')?.photoPath).toBe('a/profile-new.webp');
    expect(after.has('b')).toBe(false);
    // Nothing stale now: no third read.
    await fetchChatAuthors(['a']);
    reads.directoryChanged();
    await fetchChatAuthors(['a']);
    expect(asked).toHaveLength(3);
  });
});

describe('open screens', () => {
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    }
  };

  // The robots, 2026-11-04: a topic left open kept an old photo for 112 s+.
  it('read every author they draw again on a page shown again, in one read, and redraw', async () => {
    const data = rows.map((row) => ({ ...row }));
    const { useChatAuthors } = await loadWithClient(data);
    const { FACES_FRESH_MS } = await import('@/lib/shared-reads');
    const topic = renderHook(() => useChatAuthors(['a', 'b']));
    const likes = renderHook(() => useChatAuthors(['a']));
    await settle();
    expect(topic.result.current.get('a')?.photoPath).toBe('seed/a.webp');
    const before = asked.length;
    Object.assign(data[0] ?? {}, { photo_path: 'a/profile-new.webp' });
    const later = Date.now() + FACES_FRESH_MS;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(asked.slice(before)).toEqual([['a', 'b']]);
    expect(topic.result.current.get('a')?.photoPath).toBe('a/profile-new.webp');
    expect(likes.result.current.get('a')?.photoPath).toBe('a/profile-new.webp');
    vi.restoreAllMocks();
  });

  it('redraw a photo another read brought, reading nothing', async () => {
    const { useChatAuthors, rememberChatAuthors } = await loadWithClient(rows);
    const open = renderHook(() => useChatAuthors(['a']));
    await settle();
    const before = asked.length;
    act(() => {
      rememberChatAuthors([{ ...rows[0], photo_path: 'a/profile-new.webp' } as (typeof rows)[0]]);
    });
    await settle();
    expect(open.result.current.get('a')?.photoPath).toBe('a/profile-new.webp');
    expect(asked.length).toBe(before);
  });
});
