import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import { type Answers, canDecline, QUESTIONS } from '@/routes/profile/questions';

/**
 * Reading and writing the survey's answers.
 *
 * The survey is resumable: it loads what is already there so somebody can stop
 * at screen four and come back to screen four, which matters for a form this
 * long and this personal. It reads and writes the member's own row through
 * `members`, where own-row-only RLS means the query cannot touch anybody else's
 * even if asked to.
 *
 * Each screen saves as it is left rather than everything at the end. A survey
 * that loses eleven screens because the twelfth failed is a survey nobody
 * finishes twice.
 */

/**
 * The member columns the survey owns, derived from the questions themselves,
 * plus `declined`.
 *
 * `declined` is not a question's column and never will be — it is the record of
 * which questions somebody would rather not answer, for the survey and the
 * details form both, so it is appended rather than derived.
 */
const COLUMNS = [...QUESTIONS.map((q) => q.column), 'declined'];

/** What the row says somebody has declined, with anything unexpected dropped. */
export function declinedFrom(row: Record<string, unknown>): Set<string> {
  const value = row.declined;
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((v): v is string => typeof v === 'string'));
}

export async function loadAnswers(): Promise<
  { ok: true; answers: Answers; declined: Set<string> } | { ok: false; error: string }
> {
  // Asked for once with `declined` and once without.
  //
  // This project deploys the app ahead of its migrations often enough that it
  // has its own conventions for it, and a select naming a column the database
  // does not have fails the *whole query* — so a survey shipped an hour before
  // 20260917030000 lands would not load at all, rather than loading without the
  // one thing it cannot know yet. That is the same shape as the events page
  // refusing to load over an ungranted `series_id`, which took three days to
  // find because the error pointed nowhere near the cause.
  let result = await getSupabase().from('members').select(COLUMNS.join(', ')).maybeSingle();
  if (result.error) {
    const withoutDeclined = await getSupabase()
      .from('members')
      .select(COLUMNS.filter((c) => c !== 'declined').join(', '))
      .maybeSingle();
    // Only the second failure is reported. If the fallback fails too, the
    // problem is not the column and the first message is the misleading one.
    if (withoutDeclined.error) {
      return {
        ok: false,
        error: describeError(withoutDeclined.error, 'Could not load your answers.'),
      };
    }
    result = withoutDeclined;
  }

  const row = (result.data ?? {}) as Record<string, unknown>;
  const answers: Answers = {};
  for (const question of QUESTIONS) {
    const value = row[question.column];
    if (value === null || value === undefined) continue;
    if (question.kind === 'many') {
      answers[question.key] = Array.isArray(value) ? (value as string[]) : [];
    } else if (question.kind === 'yesno') {
      answers[question.key] = Boolean(value);
    } else if (typeof value === 'string') {
      answers[question.key] = value;
    }
    // Anything else is left unanswered rather than coerced. A column that comes
    // back in an unexpected shape should read as empty, not as "[object
    // Object]" sitting in somebody's profile.
  }
  return { ok: true, answers, declined: declinedFrom(row) };
}

/**
 * Record or withdraw a decline.
 *
 * The whole array is written rather than an append, because PostgREST has no
 * array-append and a read-modify-write of one member's own single row is not
 * a contention problem — there is exactly one person who can write it.
 *
 * `canDecline` is checked before the write so the refusal is a sentence rather
 * than a constraint violation, but it is not the enforcement: the database has
 * `members_declined_excludes_required` and that is what actually holds.
 */
/**
 * The constraints on members are the survey's own answer lists, which the
 * form only offers from; reaching one means an older build offered a value
 * the database has since dropped.
 */
const ANSWER_REFUSAL = {
  attempt: 'Your answer was not saved.',
  refused: 'Only an active member can change their answers.',
  constraints: {
    members_interests_check: 'Up to three interests.',
    members_declined_excludes_required: 'Your name and birthday cannot be left blank.',
  },
};

export async function saveDeclined(
  userId: string,
  declined: ReadonlySet<string>,
): Promise<{ ok: boolean; error?: string }> {
  const keys = [...declined].filter(canDecline);
  const { error } = await getSupabase().from('members').update({ declined: keys }).eq('id', userId);
  return error ? { ok: false, error: describeError(error, ANSWER_REFUSAL) } : { ok: true };
}

/**
 * Saves the answers for one screen.
 *
 * A text answer of only whitespace is written as null rather than as a blank
 * string, so "skipped" and "answered with nothing" do not end up looking
 * different in the database while looking the same on screen.
 */
export async function saveAnswers(
  userId: string,
  keys: string[],
  answers: Answers,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    const question = QUESTIONS.find((q) => q.key === key);
    if (!question) continue;
    const value = answers[key];
    if (value === undefined) continue;
    if (typeof value === 'string') patch[question.column] = value.trim() || null;
    else patch[question.column] = value;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await getSupabase().from('members').update(patch).eq('id', userId);
  return error ? { ok: false, error: describeError(error, ANSWER_REFUSAL) } : { ok: true };
}
