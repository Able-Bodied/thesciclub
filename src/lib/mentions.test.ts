import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Mentions from '@/lib/mentions';
import {
  insertMention,
  type MentionCandidate,
  mentionAt,
  mentionedUsernames,
  splitMentions,
  suggestMentions,
} from '@/lib/mentions';

describe('the @name at the caret', () => {
  it('finds one being typed, from its "@"', () => {
    expect(mentionAt('Ask @Ma', 7)).toEqual({ start: 4, text: 'ma' });
    expect(mentionAt('@', 1)).toEqual({ start: 0, text: '' });
    expect(mentionAt('line\n@sam_l', 11)).toEqual({ start: 5, text: 'sam_l' });
  });

  it('not inside a word or an email address, and not once a space is typed', () => {
    expect(mentionAt('bo@example', 10)).toBeNull();
    expect(mentionAt('@maya ', 6)).toBeNull();
    expect(mentionAt('Ask @maya', 3)).toBeNull();
  });

  it('puts the name in with one space after, and the caret past it', () => {
    const query = { start: 4, text: 'ma' };
    expect(insertMention('Ask @ma', 7, query, 'maya.local')).toEqual({
      value: 'Ask @maya.local ',
      caret: 16,
    });
    expect(insertMention('Ask @ma about it', 7, query, 'maya.local')).toEqual({
      value: 'Ask @maya.local about it',
      caret: 16,
    });
  });
});

// As private.mentioned_usernames reads them (20261029070000).
describe('the @names in some words', () => {
  it('splits them out, leaving a full stop after one as words', () => {
    expect(splitMentions('Hi @Ana.R. and @bo_b')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'mention', text: '@Ana.R', username: 'ana.r' },
      { kind: 'text', text: '. and ' },
      { kind: 'mention', text: '@bo_b', username: 'bo_b' },
    ]);
  });

  it('skips an address, a name too short or too long, and says each once', () => {
    expect(mentionedUsernames(`x@cy.com @e @${'z'.repeat(21)} (@ann) **@fay** @ann`)).toEqual([
      'ann',
      'fay',
    ]);
  });
});

describe('who to suggest', () => {
  const member = (username: string, displayName: string): MentionCandidate => ({
    id: username,
    username,
    displayName,
    photoPath: null,
    photoAlt: null,
  });
  const club = [
    member('jan', 'Jan Ruiz'),
    member('mari.j', 'Mari Jones'),
    member('bo', 'Bo Martin'),
    member('sam_mar', 'Sam Lee'),
  ];

  it('puts an @name that starts so first, then a name, then an @name with it inside', () => {
    expect(suggestMentions(club, 'mar').map((m) => m.username)).toEqual([
      'mari.j',
      'bo',
      'sam_mar',
    ]);
  });

  // The owner, 2026-10-29: after the first letter, not on the "@" alone.
  it('offers nobody for a bare "@", or for no match', () => {
    expect(suggestMentions(club, '')).toEqual([]);
    expect(suggestMentions(club, 'zz')).toEqual([]);
  });

  it("keeps to a conversation's members", () => {
    expect(
      suggestMentions(club, 'mar', 6, { among: ['bo', 'sam_mar'] }).map((m) => m.username),
    ).toEqual(['bo', 'sam_mar']);
  });

  it('puts the people already in a topic first, then everybody else', () => {
    expect(suggestMentions(club, 'mar', 6, { first: ['sam_mar'] }).map((m) => m.username)).toEqual([
      'sam_mar',
      'mari.j',
      'bo',
    ]);
  });
});

/** A fresh copy with the client stubbed: the module keeps what it has read. */
async function loadWithClient(
  rows: { id: string; username: string | null; has_profile: boolean }[],
): Promise<{ mentions: typeof Mentions; asked: string[][] }> {
  const asked: string[][] = [];
  vi.resetModules();
  vi.doMock('@/lib/supabase', () => ({
    getSupabase: () => ({
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'me' } } } }) },
      from: (view: string) => ({
        select: () => ({
          in: (_column: string, names: string[]) => {
            asked.push(names);
            return Promise.resolve({ data: rows, error: null });
          },
          not: () => ({
            order: () => ({
              order: () => ({
                range: () =>
                  Promise.resolve({
                    data:
                      view === 'browse_members'
                        ? [
                            { id: 'me', display_name: 'Me', username: 'me' },
                            { id: 'a', display_name: 'Ana', username: 'ana' },
                          ]
                        : [],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    }),
  }));
  return { mentions: await import('@/lib/mentions'), asked };
}

afterEach(() => {
  vi.doUnmock('@/lib/supabase');
});

describe('reading', () => {
  it('asks once for the names a screen’s posts name together, and remembers', async () => {
    const { mentions, asked } = await loadWithClient([
      { id: 'a', username: 'ana', has_profile: true },
    ]);
    await Promise.all([mentions.resolveMentions(['ana']), mentions.resolveMentions(['bo'])]);
    expect(asked).toEqual([['ana', 'bo']]);
    await mentions.resolveMentions(['ana', 'bo']);
    expect(asked).toHaveLength(1);
  });

  it('suggests Peers’ members with an @name, never the viewer', async () => {
    const { mentions } = await loadWithClient([]);
    expect((await mentions.loadMentionCandidates()).map((m) => m.username)).toEqual(['ana']);
  });
});
