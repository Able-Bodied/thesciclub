import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * A trusted partner introducing two members (20261029100000). Each is asked;
 * two yeses open a group of the three, with the partner's note first.
 * Whoever said yes is never told the other said no: theirs waits, then
 * expires.
 */

export const INTRODUCTION_NOTE_MAX = 500;

export type IntroductionStatus = 'asked' | 'opened' | 'declined' | 'withdrawn' | 'expired';

/** One introduction, as one of the two introduced sees it. */
export interface IntroductionForMe {
  id: string;
  status: IntroductionStatus;
  /** Null until they answer. */
  myAnswer: boolean | null;
  note: string;
  createdAt: string;
  /** The group, once open and while they are in it. */
  threadId: string | null;
  partner: { id: string; name: string; photoPath: string | null; title: string | null } | null;
  other: {
    id: string;
    name: string;
    username: string | null;
    photoPath: string | null;
    photoAlt: string | null;
  };
}

interface Row {
  id: string;
  status: IntroductionStatus;
  my_answer: boolean | null;
  note: string;
  created_at: string;
  thread_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  partner_photo: string | null;
  partner_title: string | null;
  other_id: string;
  other_name: string;
  other_username: string | null;
  other_photo: string | null;
  other_photo_alt: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export async function makeIntroduction(
  firstId: string,
  secondId: string,
  note: string,
): Promise<Result<string>> {
  try {
    const { data, error } = (await getSupabase().rpc('make_introduction', {
      p_first: firstId,
      p_second: secondId,
      p_note: note.trim(),
    })) as { data: string | null; error: Failure | null };
    if (error) {
      // 54000 is the week's limit, worded by the database.
      if (error.code === '54000') return { ok: false, error: error.message };
      return {
        ok: false,
        error: describeError(error, {
          attempt: 'Could not send the introduction.',
          duplicate: 'Those two have already been asked, and have 30 days to answer.',
        }),
      };
    }
    if (!data) return { ok: false, error: 'Could not send the introduction. Try again.' };
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not send the introduction.') };
  }
}

/** Resolves to the group's id once both said yes, or null while it waits. */
export async function answerIntroduction(id: string, yes: boolean): Promise<Result<string | null>> {
  try {
    const { data, error } = (await getSupabase().rpc('answer_introduction', {
      p_introduction: id,
      p_yes: yes,
    })) as { data: string | null; error: Failure | null };
    if (error) return { ok: false, error: describeError(error, 'Could not send your answer.') };
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not send your answer.') };
  }
}

/** Null when there is none for this member to see. */
export async function fetchIntroductionForMe(
  id: string,
): Promise<Result<IntroductionForMe | null>> {
  try {
    const { data, error } = (await getSupabase().rpc('introduction_for_me', {
      p_introduction: id,
    })) as { data: Row[] | null; error: Failure | null };
    if (error)
      return { ok: false, error: describeError(error, 'Could not load this introduction.') };
    const row = data?.[0];
    if (!row) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        id: row.id,
        status: row.status,
        myAnswer: row.my_answer,
        note: row.note,
        createdAt: row.created_at,
        threadId: row.thread_id,
        partner: row.partner_id
          ? {
              id: row.partner_id,
              name: row.partner_name ?? 'A trusted partner',
              photoPath: row.partner_photo,
              title: row.partner_title,
            }
          : null,
        other: {
          id: row.other_id,
          name: row.other_name,
          username: row.other_username,
          photoPath: row.other_photo,
          photoAlt: row.other_photo_alt,
        },
      },
    };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not load this introduction.') };
  }
}
