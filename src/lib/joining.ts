import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Whether anybody can join, or only somebody invited (20261014000000).
 *
 * The database decides who gets in; this is only what the screens say. The
 * welcome and join screens ask so they stop telling a walk-in to find an
 * invite, and Admin's Invites tab flips it.
 */

/**
 * True when open. Anything else, including no answer, is false: the screens
 * then say what they always said, and the database still lets in whoever it
 * would have.
 */
export async function fetchJoiningIsOpen(): Promise<boolean> {
  try {
    const response = await getSupabase().rpc('joining_is_open');
    const answer: unknown = response.data;
    return !response.error && answer === true;
  } catch {
    return false;
  }
}

/** False until the answer comes. */
export function useJoiningIsOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchJoiningIsOpen().then((answer) => {
      if (alive) setOpen(answer);
    });
    return () => {
      alive = false;
    };
  }, []);
  return open;
}

export interface JoiningSetting {
  open: boolean;
  /** When an administrator last flipped it; null if nobody ever has. */
  changedAt: string | null;
}

/** The row itself, which only an administrator can read. */
export async function fetchJoiningSetting(): Promise<
  { ok: true; setting: JoiningSetting } | { ok: false; error: string }
> {
  try {
    const { data, error } = await getSupabase()
      .from('club_joining')
      .select('open, changed_at')
      .maybeSingle();
    if (error) return { ok: false, error: describeError(error, 'Could not check who can join.') };
    const row: unknown = data;
    if (!row || typeof row !== 'object' || !('open' in row) || typeof row.open !== 'boolean') {
      return { ok: false, error: 'Could not check who can join.' };
    }
    const changedAt =
      'changed_at' in row && typeof row.changed_at === 'string' ? row.changed_at : null;
    return { ok: true, setting: { open: row.open, changedAt } };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not check who can join.') };
  }
}

export async function setJoiningOpen(
  open: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getSupabase().rpc('admin_set_joining_open', { p_open: open });
    return error
      ? { ok: false, error: describeError(error, 'Who can join was not changed.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Who can join was not changed.') };
  }
}

/** Admin's view of the switch: the setting, a reload, and its first failure. */
export function useJoiningSetting(): {
  setting: JoiningSetting | null;
  error: string | null;
  reload: () => void;
} {
  const [setting, setSetting] = useState<JoiningSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const reload = useCallback(() => {
    void fetchJoiningSetting().then((result) => {
      if (!alive.current) return;
      if (result.ok) {
        setSetting(result.setting);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);
  return { setting, error, reload };
}
