import { getSupabase } from '@/lib/supabase';
import { type Answers, QUESTIONS } from '@/routes/profile/questions';

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

/** The member columns the survey owns, derived from the questions themselves. */
const COLUMNS = QUESTIONS.map((q) => q.column);

export async function loadAnswers(): Promise<
  { ok: true; answers: Answers } | { ok: false; error: string }
> {
  const result = await getSupabase().from('members').select(COLUMNS.join(', ')).maybeSingle();
  if (result.error) return { ok: false, error: result.error.message };

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
  return { ok: true, answers };
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
  return error ? { ok: false, error: error.message } : { ok: true };
}
