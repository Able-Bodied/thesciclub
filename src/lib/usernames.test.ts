import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Answer {
  data: unknown;
  error: { message: string } | null;
}

const db = vi.hoisted(() => {
  const answer: Answer = { data: null, error: null };
  return { asked: [] as { name: string; args: unknown }[], answer };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      db.asked.push({ name, args });
      return Promise.resolve(db.answer);
    },
  }),
}));

const { isValidUsername, normalizeUsername, suggestUsernames, usernameAvailable } = await import(
  '@/lib/usernames'
);

beforeEach(() => {
  db.asked = [];
  db.answer = { data: null, error: null };
});

describe('the shape of a username', () => {
  it('is 3 to 20 of lowercase letters, digits, dots and underscores', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('a.b_c9')).toBe(true);
    expect(isValidUsername('a'.repeat(20))).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(isValidUsername('Dana')).toBe(false);
    expect(isValidUsername('da na')).toBe(false);
    expect(isValidUsername('da-na')).toBe(false);
    expect(isValidUsername('dänä')).toBe(false);
  });

  it('does not start or end with a dot or underscore, or double a dot', () => {
    for (const bad of ['.dana', '_dana', 'dana.', 'dana_', 'da..na']) {
      expect(isValidUsername(bad)).toBe(false);
    }
    expect(isValidUsername('da.na')).toBe(true);
    expect(isValidUsername('da__na')).toBe(true);
  });

  it('is made from what was typed: lowercase, no @, no spaces', () => {
    expect(normalizeUsername('@Dana S')).toBe('danas');
  });
});

describe('suggestUsernames', () => {
  it('asks with the name and gives at most five', async () => {
    db.answer = { data: ['a', 'b', 'c', 'd', 'e', 'f'], error: null };
    expect(await suggestUsernames(' Dana Smith ')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(db.asked).toEqual([{ name: 'suggest_usernames', args: { full_name: 'Dana Smith' } }]);
  });

  it('asks nothing of an empty name', async () => {
    expect(await suggestUsernames('  ')).toEqual([]);
    expect(db.asked).toEqual([]);
  });

  it('gives none, rather than an error, when it cannot ask', async () => {
    db.answer = { data: null, error: { message: 'offline' } };
    expect(await suggestUsernames('Dana')).toEqual([]);
  });
});

describe('usernameAvailable', () => {
  it('passes the database’s yes or no', async () => {
    db.answer = { data: true, error: null };
    expect(await usernameAvailable('dana')).toBe(true);
    db.answer = { data: false, error: null };
    expect(await usernameAvailable('dana')).toBe(false);
    expect(db.asked[0]).toEqual({ name: 'username_available', args: { name: 'dana' } });
  });

  it('is null, not no, when it could not be asked', async () => {
    db.answer = { data: null, error: { message: 'offline' } };
    expect(await usernameAvailable('dana')).toBeNull();
  });
});
