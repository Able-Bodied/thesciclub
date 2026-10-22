import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/lib/account';
import type { ChatWriteResult } from '@/lib/chat/threads';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Blocking a member (20261022050000 to 20261022080000).
 *
 * The database does the hiding and the refusing; this asks and reads back
 * the blocker's own list. The blocked member cannot read it, and is not told.
 */

/** What the blocked member sees when they try to message. Said by the database too. */
export const CANT_MESSAGE = "You can't message this member.";

/** What blocking does, said before it is done. Tested: it is a promise. */
export function blockExplainer(name: string): string[] {
  return [
    `You won't see ${name}'s posts, replies, messages, likes or reactions anywhere in the club, including rooms and groups you share.`,
    `Neither of you can message the other, and you drop out of each other's Peers. Nothing ${name} does will notify you.`,
    `${name} is not told. The club's administrators are, so they can look into it.`,
    'You can unblock them at any time from Me → Settings.',
  ];
}

const BLOCK_FAILED = { attempt: 'They were not blocked.' };
const UNBLOCK_FAILED = { attempt: 'They are still blocked.' };

export async function blockMember(memberId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('block_member', { member: memberId });
  if (error) return { ok: false, error: describeError(error, BLOCK_FAILED) };
  return { ok: true, value: null };
}

export async function unblockMember(memberId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('unblock_member', { member: memberId });
  if (error) return { ok: false, error: describeError(error, UNBLOCK_FAILED) };
  return { ok: true, value: null };
}

export interface BlockedMember {
  memberId: string;
  blockedAt: string;
}

export interface MyBlocksState {
  /** Newest first. */
  blocked: BlockedMember[];
  ids: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface BlockRow {
  blocked_id: string;
  created_at: string;
}

/** The members the viewer has blocked. */
export function useMyBlocks(): MyBlocksState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [blocked, setBlocked] = useState<BlockedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Read so reload() re-runs this.
    if (attempt < 0) return;
    if (!memberId) {
      setBlocked([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    async function load() {
      try {
        const { data, error: failed } = await getSupabase()
          .from('member_blocks')
          .select('blocked_id, created_at')
          .eq('blocker_id', memberId)
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)
          .overrideTypes<BlockRow[], { merge: false }>();
        if (aborted()) return;
        if (failed) {
          setError(describeError(failed, 'Could not read who you have blocked.'));
        } else {
          setBlocked(data.map((r) => ({ memberId: r.blocked_id, blockedAt: r.created_at })));
          setError(null);
        }
      } catch (e) {
        if (aborted()) return;
        setError(describeThrown(e, 'Could not read who you have blocked.'));
      }
      setLoading(false);
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, attempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const ids = useMemo(() => new Set(blocked.map((b) => b.memberId)), [blocked]);
  return {
    blocked,
    ids,
    loading,
    error,
    reload,
  };
}
