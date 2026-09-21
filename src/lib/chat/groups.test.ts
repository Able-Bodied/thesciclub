import { describe, expect, it } from 'vitest';
import { GROUP_CAP, GROUP_NAME_MAX, groupProblem } from '@/lib/chat/groups';

/**
 * The pure half of groups.ts. Nothing here touches supabase — the writes are
 * four thin wrappers over rpc calls and the rules they would be testing live
 * in 20260918130000, where `supabase/tests/chat-groups.sql` runs them under
 * RLS against a real database.
 *
 * What is worth testing here is the sentence the form shows, because it is the
 * same value that disables the button: a member must never be looking at a
 * disabled button with no explanation, or at an explanation with the button
 * still live.
 */

describe('groupProblem', () => {
  it('says nothing about a group that is ready to make', () => {
    expect(groupProblem('Saturday ride', ['a'])).toBeNull();
  });

  it('asks for a name first, before counting anybody', () => {
    // Name before members, deliberately: the field is above the picker, and a
    // form that complains about the bottom of itself while the top is empty
    // reads as broken.
    expect(groupProblem('', [])).toBe('Give the group a name.');
    expect(groupProblem('   ', ['a'])).toBe('Give the group a name.');
  });

  it('holds the name to the length the column holds it to', () => {
    expect(groupProblem('x'.repeat(GROUP_NAME_MAX), ['a'])).toBeNull();
    expect(groupProblem('x'.repeat(GROUP_NAME_MAX + 1), ['a'])).toContain(
      `${GROUP_NAME_MAX} characters`,
    );
  });

  it('ignores the whitespace the database would trim', () => {
    // btrim() runs before the length check in chat_create_group, so a name of
    // sixty characters and a trailing space is a name of sixty characters.
    expect(groupProblem(` ${'x'.repeat(GROUP_NAME_MAX)} `, ['a'])).toBeNull();
  });

  it('asks for somebody else, because a group of one is a notepad', () => {
    expect(groupProblem('Just me', [])).toBe('Pick at least one member.');
  });

  it('counts the member making it towards the cap', () => {
    // The cap is the roster, and the caller is on it. One fewer than the cap is
    // the last list that works.
    expect(groupProblem('Big', new Array(GROUP_CAP - 1).fill('a'))).toBeNull();
    expect(groupProblem('Bigger', new Array(GROUP_CAP).fill('a'))).toContain(
      `${GROUP_CAP} members, counting you`,
    );
  });
});
