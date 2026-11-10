import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Connecting two members (20261031110000): a group of the two opens at once,
 * the connector too only if they chose, starting with a line saying who
 * connected them. One from before that asked each of them, and waits for two
 * yeses until it expires; whoever said yes is never told the other said no.
 */

/** As long as any chat message (the owner, 2026-11-06; 20261106040000). */
export const INTRODUCTION_NOTE_MAX = 4000;
/** The count of what is left shows only this close to the end. */
export const INTRODUCTION_NOTE_WARN = 200;

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
  /** The connector is in the conversation it opens too (20261029120000). */
  join = false,
): Promise<Result<string>> {
  try {
    const { data, error } = (await getSupabase().rpc('make_introduction', {
      p_first: firstId,
      p_second: secondId,
      p_note: note.trim(),
      p_join: join,
    })) as { data: string | null; error: Failure | null };
    if (error) {
      // 54000 is the week's limit, worded by the database.
      if (error.code === '54000') return { ok: false, error: error.message };
      return {
        ok: false,
        error: describeError(error, {
          attempt: 'Could not connect them.',
          duplicate: 'Those two have been connected already.',
        }),
      };
    }
    if (!data) return { ok: false, error: 'Could not connect them. Try again.' };
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not connect them.') };
  }
}

/**
 * Connecting several members at once, or into a group (20261106020000):
 * two or more into a new group, named or not, or one or more into a group
 * the connector is in or started. Resolves to the group's id.
 */
export async function connectMembers(input: {
  people: string[];
  note: string;
  join: boolean;
  /** An existing group; null for a new one. */
  groupId: string | null;
  /** A new group's name; blank gives the default. */
  name: string;
  /** A new group with groupId's members, leaving that group as it is. */
  copy?: boolean;
}): Promise<Result<string>> {
  try {
    const { data, error } = (await getSupabase().rpc('connect_members', {
      p_members: input.people,
      p_note: input.note.trim(),
      p_join: input.join,
      p_group: input.groupId,
      p_name: input.groupId && !input.copy ? null : input.name.trim() || null,
      // Only when used, so the other two work on a database without it.
      ...(input.copy ? { p_copy: true } : {}),
    })) as { data: string | null; error: Failure | null };
    if (error) {
      if (error.code === '54000') return { ok: false, error: error.message };
      return {
        ok: false,
        error: describeError(error, {
          attempt: 'Could not connect them.',
          duplicate: 'Those two have been connected already.',
        }),
      };
    }
    if (!data) return { ok: false, error: 'Could not connect them. Try again.' };
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not connect them.') };
  }
}

/** A group a connector can bring people into. */
export interface ConnectionGroup {
  id: string;
  name: string;
  members: number;
  /** The connector is in it. */
  mine: boolean;
  /** The connector started it by connecting people. */
  started: boolean;
}

interface GroupRow {
  thread_id: string;
  name: string;
  members: number;
  i_am_in: boolean;
  started: boolean;
}

/** Groups they started here, and plain groups they are in, newest first. */
export async function fetchConnectionGroups(): Promise<Result<ConnectionGroup[]>> {
  try {
    const { data, error } = (await getSupabase().rpc('my_connection_groups')) as {
      data: GroupRow[] | null;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, 'Could not load your groups.') };
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.thread_id,
        name: row.name,
        members: row.members,
        mine: row.i_am_in,
        started: row.started,
      })),
    };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'Could not load your groups.') };
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
              name: row.partner_name ?? 'A verified professional',
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
