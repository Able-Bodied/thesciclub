import { describe, expect, it } from 'vitest';
import { REPORT_NOTE_MAX, reportNoteProblem, reportPreamble } from '@/lib/chat/reports';

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
