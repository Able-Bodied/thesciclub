import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { vapidPublicKey } from '@/lib/push/notifications';
import { getSupabase } from '@/lib/supabase';

/**
 * Muting a conversation, a topic or a room: no notifications from it.
 *
 * Three tables, one shape (20260927010000): the row's existence is the mute,
 * so muting is an insert and unmuting a delete — never an upsert, which would
 * need an update grant these tables deliberately do not have (the join-a-room
 * bug, HANDOFF.md). A double tap is absorbed by the unique key: a duplicate
 * means it is already muted, which is what was asked for.
 *
 * Only offered while notifications exist at all (`vapidPublicKey()`): a mute
 * button with nothing to mute is a control that does nothing.
 *
 * Screen tests stub this module; it reads and writes the club.
 */

export type MuteTarget =
  | { kind: 'thread'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'room'; id: string };

const TABLES = {
  thread: { table: 'chat_thread_mutes', column: 'thread_id' },
  topic: { table: 'chat_topic_mutes', column: 'topic_id' },
  room: { table: 'chat_room_mutes', column: 'room_id' },
} as const;

/** Notifications exist in this build, so a mute means something. */
export function mutesOffered(): boolean {
  return vapidPublicKey() !== null;
}

export async function readMuted(target: MuteTarget, userId: string): Promise<boolean> {
  const { table, column } = TABLES[target.kind];
  const { data, error } = await getSupabase()
    .from(table)
    .select(column)
    .eq('member_id', userId)
    .eq(column, target.id)
    .maybeSingle();
  if (error) throw new Error(describeError(error, 'Could not check whether this is muted.'));
  return data !== null;
}

export async function setMuted(
  target: MuteTarget,
  userId: string,
  muted: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { table, column } = TABLES[target.kind];
  const supabase = getSupabase();
  if (muted) {
    const { error } = await supabase
      .from(table)
      .insert({ member_id: userId, [column]: target.id } as never);
    // Already muted, from another tab or a double tap: that is the outcome.
    if (error && error.code !== '23505') {
      return { ok: false, error: describeError(error, 'It was not muted.') };
    }
    return { ok: true };
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('member_id', userId)
    .eq(column, target.id);
  if (error) return { ok: false, error: describeError(error, 'It is still muted.') };
  return { ok: true };
}

export function useMute(target: MuteTarget, userId: string | null) {
  const [muted, setState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, id } = target;

  useEffect(() => {
    if (!userId || !mutesOffered()) return;
    let live = true;
    readMuted({ kind, id }, userId)
      .then((value) => {
        if (live) setState(value);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [kind, id, userId]);

  const toggle = useCallback(() => {
    if (!userId || muted === null) return;
    const next = !muted;
    setBusy(true);
    setError(null);
    void setMuted({ kind, id }, userId, next)
      .then((result) => {
        if (result.ok) setState(next);
        else setError(result.error);
      })
      .finally(() => {
        setBusy(false);
      });
  }, [kind, id, userId, muted]);

  return { muted, busy, error, toggle };
}
