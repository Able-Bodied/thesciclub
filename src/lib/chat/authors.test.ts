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
  // signal turns a whole thread into Former member for the rest of the session.
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
});
