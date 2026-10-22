import { describe, expect, it, vi } from 'vitest';
import {
  REPORT_NOTE_MAX,
  reportMember,
  reportNoteProblem,
  reportPreamble,
  toProfile,
} from '@/lib/chat/reports';

// The one network call this file makes.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

/**
 * The pure half of reports.ts. The writes are three thin wrappers over rpc
 * calls and the rules they would be testing live in 20260918150000, where
 * `supabase/tests/chat-reports.sql` runs them under RLS against a real
 * database. Only `@/lib/chat/reports` is imported, never mocked — a vi.mock of
 * the module under test would let this file assert its own wording.
 *
 * `reportPreamble` is the only thing here that is worth more than arithmetic.
 * It is a promise to a member about what the club does with somebody's words,
 * made at the moment they are deciding whether to make a complaint, and the
 * screen must not be the only copy of it.
 */

describe('reportNoteProblem', () => {
  it('says nothing about a note somebody can send', () => {
    expect(reportNoteProblem('')).toBeNull();
    expect(reportNoteProblem('He is selling supplements in the bowel room.')).toBeNull();
  });

  it('holds the note to the length the column holds it to', () => {
    expect(reportNoteProblem('x'.repeat(REPORT_NOTE_MAX))).toBeNull();
    expect(reportNoteProblem('x'.repeat(REPORT_NOTE_MAX + 1))).toContain(
      `${REPORT_NOTE_MAX} characters`,
    );
  });

  it('ignores the whitespace the database would trim', () => {
    // btrim() runs before the length check, so five hundred characters and a
    // trailing newline is five hundred characters.
    expect(reportNoteProblem(` ${'x'.repeat(REPORT_NOTE_MAX)}\n`)).toBeNull();
  });
});

describe('reportPreamble', () => {
  it('names the one thing that is disclosed, and says the person is not told', () => {
    for (const kind of ['post', 'message'] as const) {
      const said = reportPreamble(kind);
      expect(said).toContain(kind === 'post' ? 'This post' : 'This message');
      expect(said).toContain('with your name');
      expect(said).toContain('The person is not told.');
    }
  });

  it('says a profile goes as it is now, stays reported after an edit, and the member is not told', () => {
    const said = reportPreamble('profile');
    expect(said).toContain('as they are now');
    expect(said).toContain('with your name');
    expect(said).toContain('Changing the profile later does not remove them.');
    expect(said).toContain('The member is not told.');
  });

  it('promises a conversation stays shut, and does not promise it of a room', () => {
    // The difference is real and not a wording choice: a report about a message
    // carries no thread id, so there is no way back into the conversation. A
    // report about a post carries topic_id and room_id, and an administrator
    // could already read that room. Promising "nothing else" of a room post
    // would be true and misleading at once.
    expect(reportPreamble('message')).toContain('Nothing else in this conversation does.');
    expect(reportPreamble('post')).not.toContain('Nothing else');
    expect(reportPreamble('post')).toContain('open the topic it is in');
  });
});

describe('reportMember', () => {
  // PostgREST sends arguments by name, so the names are the contract.
  it('sends the member and the trimmed note under the names the function takes', async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await reportMember('bo', '  Rude bio ')).toEqual({ ok: true, value: null });
    expect(rpc).toHaveBeenCalledWith('report_member', { member: 'bo', report_note: 'Rude bio' });
  });

  it('passes the database’s own sentence on', async () => {
    rpc.mockResolvedValue({ error: { message: 'There is no such member.', code: 'P0002' } });
    const result = await reportMember('bo', '');
    expect(result).toEqual({ ok: false, error: 'There is no such member.' });
  });
});

describe('toProfile', () => {
  // A deleted member's copy (20261022150000): no @username, no description.
  it('reads a copy with only the name and the words', () => {
    expect(
      toProfile({ display_name: 'Deleted member', bio: 'Kept', interests: ['Chess'] }),
    ).toEqual({
      displayName: 'Deleted member',
      username: null,
      photoAlt: null,
      bio: 'Kept',
      howInjured: null,
      detail: null,
      sportsEquipment: null,
      grants: null,
      fieldOfWork: null,
      interests: ['Chess'],
      topics: [],
      selfCare: [],
    });
  });

  it('survives a copy with nothing in it', () => {
    expect(toProfile(null)).toMatchObject({
      displayName: 'Unnamed',
      username: null,
      interests: [],
    });
    expect(toProfile({ display_name: 7, topics: 'x' })).toMatchObject({
      displayName: 'Unnamed',
      topics: [],
    });
  });
});
