import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatWriteResult } from '@/lib/chat/threads';
import { getSupabase } from '@/lib/supabase';

/**
 * Groups: the conversations with a name and more than two people in them.
 *
 * Separate from `threads.ts`, which already carries the list, the messages and
 * the direct half, because everything here is about a roster — who is in a
 * conversation, and how somebody gets in or out of one. A group and a pair
 * share a table, a screen and a row; they do not share a single one of the
 * rules below.
 *
 * ---------------------------------------------------------------------------
 * Three functions and one delete
 * ---------------------------------------------------------------------------
 * Creating a group, adding somebody to one and joining an event's group all
 * write a row for somebody other than the caller, so all three are database
 * functions and there is no insert grant on either thread table to go around
 * them. Leaving is the exception and is an ordinary delete: it writes the
 * caller's own row and nobody else's, so a policy can say it — own row, and
 * `group` threads only. See 20260918070000.
 *
 * ---------------------------------------------------------------------------
 * The roster is read from the table
 * ---------------------------------------------------------------------------
 * `chat_thread_members` is selectable by the thread's own members, so the
 * members screen reads it directly and puts names to the ids with
 * `useChatAuthors` — which is the view that can name a member who has left the
 * directory. There is no function for it because there is no privilege to
 * borrow: a member of the group may already see exactly these rows.
 *
 * It is also the one chat table deliberately left out of the realtime
 * publication. A roster on the wire is the membership list that 20260918030000
 * spent a paragraph keeping private, so somebody added to a group finds out on
 * their next list read, which is what the focus refetch is for.
 */

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * The two numbers the form has to know before it asks the database.
 *
 * They are `chat_group_cap()` and the `chat_threads.name` constraint, copied
 * here so a member finds out they have picked a fifty-first person while they
 * are picking rather than after they press the button. The database is still
 * the one that decides — this only stops the round trip that was going to be
 * refused.
 */
export const GROUP_CAP = 50;
export const GROUP_NAME_MAX = 60;

/**
 * What is wrong with a group somebody is part-way through describing, or null.
 *
 * Pure, and the sentence is the one the screen shows, so the button's disabled
 * state and the explanation under it cannot disagree about why. It says what to
 * do rather than what is missing: "Pick at least one member" and not "members
 * required".
 */
export function groupProblem(name: string, picked: readonly string[]): string | null {
  if (name.trim().length === 0) return 'Give the group a name.';
  if (name.trim().length > GROUP_NAME_MAX) {
    return `A group's name is ${GROUP_NAME_MAX} characters or fewer.`;
  }
  if (picked.length === 0) return 'Pick at least one member.';
  // The caller is on the roster too, which is why this is one fewer than the
  // cap and not the cap.
  if (picked.length > GROUP_CAP - 1) {
    return `A group holds ${GROUP_CAP} members, counting you.`;
  }
  return null;
}

/** Start a group. Returns the thread id, so the caller can go straight to it. */
export async function createGroup(
  name: string,
  memberIds: readonly string[],
): Promise<ChatWriteResult<string>> {
  const { data, error } = (await getSupabase().rpc('chat_create_group', {
    // Named `group_name` and `member_ids`, not `name` and `members`: inside
    // plpgsql a parameter called `name` is ambiguous against
    // `chat_threads.name`. See 20260918130000.
    group_name: name.trim(),
    member_ids: memberIds,
  })) as Result<string>;
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'The group was not started.' };
  return { ok: true, value: data };
}

/** Bring one more member into a group the viewer is in. */
export async function addToGroup(
  threadId: string,
  memberId: string,
): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_add_to_group', {
    thread: threadId,
    new_member: memberId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}

/**
 * Leave a group.
 *
 * An ordinary delete and not a function, because it writes the viewer's own
 * roster row. `member_id` is named even though the policy already restricts it
 * to the caller — the same explicitness as organization-follows: a delete whose
 * scope is only the policy is one policy change away from being a delete of
 * everybody.
 */
export async function leaveGroup(
  threadId: string,
  memberId: string,
): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase()
    .from('chat_thread_members')
    .delete()
    .eq('thread_id', threadId)
    .eq('member_id', memberId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}

/**
 * The group chat for an event, made on first use.
 *
 * One call for both "open it" and "join it" — the database returns the thread
 * whether the caller was already in it or has just been let in, so the button
 * does not have to know which it is doing and a double tap is harmless.
 */
export async function joinEventGroup(eventId: string): Promise<ChatWriteResult<string>> {
  const { data, error } = (await getSupabase().rpc('chat_join_event_group', {
    event: eventId,
  })) as Result<string>;
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'The group chat was not opened.' };
  return { ok: true, value: data };
}

export interface ThreadRosterState {
  /** Member ids, oldest membership first. Empty while loading and on failure. */
  memberIds: string[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Who is in a thread. Visible to its own members and to nobody else. */
export function useThreadRoster(threadId: string | undefined): ThreadRosterState {
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setMemberIds([]);
      setLoading(false);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;

    try {
      const { data, error: failure } = (await getSupabase()
        .from('chat_thread_members')
        .select('member_id, joined_at')
        .eq('thread_id', threadId)
        // Oldest first, so the people who were there at the start are at the
        // top and somebody added this morning is not.
        .order('joined_at')
        .abortSignal(controller.signal)) as Result<{ member_id: string }[]>;
      if (aborted()) return;
      if (failure) {
        setMemberIds([]);
        setError(failure.message);
        setLoading(false);
        return;
      }
      setMemberIds((data ?? []).map((row) => row.member_id));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setMemberIds([]);
      setError(e instanceof Error ? e.message : 'Could not load who is in this group.');
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { memberIds, loading, error, reload };
}
