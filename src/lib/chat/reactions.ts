import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

export const REACTIONS = [
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '❤️', name: 'Love' },
  { emoji: '😂', name: 'Laugh' },
  { emoji: '😮', name: 'Surprised' },
  { emoji: '😢', name: 'Sad' },
  { emoji: '🙏', name: 'Thank you' },
  { emoji: '🎉', name: 'Celebrate' },
  { emoji: '💪', name: 'Strength' },
] as const;
export type ReactionEmoji = (typeof REACTIONS)[number]['emoji'];
export type ReactionKind = 'post' | 'message';
export interface ReactionRow {
  target_id: string;
  member_id: string;
  emoji: ReactionEmoji | null;
}
export interface ReactionsState {
  rows: readonly ReactionRow[];
  loading: boolean;
  error: string | null;
  pending: ReadonlySet<string>;
  failure: { target: string; message: string } | null;
  choose: (target: string, emoji: ReactionEmoji | null) => Promise<boolean>;
  reload: () => void;
}

/** One read/subscription per screen, shared by all its posts or messages.
 * Writes are serialized per target and counts move only after confirmation.
 * Scope changes discard old reads and write results rather than leaking them
 * into another conversation or account. */
export function useReactions(
  kind: ReactionKind,
  ids: readonly string[],
  memberId: string | null,
): ReactionsState {
  const key = [...new Set(ids)].sort().join(',');
  const scope = `${kind}:${memberId}:${key}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const table = kind === 'post' ? 'chat_post_reactions' : 'chat_message_reactions';
  const announce = useAnnounce();
  const [snapshot, setSnapshot] = useState<{ scope: string; rows: ReactionRow[] }>({
    scope,
    rows: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ReactionsState['failure']>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  const version = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  useRealtimeRows({ table, onChange: reload, enabled: Boolean(memberId && key) });

  useEffect(() => {
    if (attempt < 0) return;
    setError(null);
    if (!memberId || !key) {
      setSnapshot({ scope, rows: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const readVersion = version.current;
    setLoading(true);
    async function load() {
      try {
        const rows: ReactionRow[] = [];
        // Supabase caps a response at 1,000 rows. Stable key order and pages
        // keep a busy conversation's counts from silently truncating.
        for (let offset = 0; ; offset += 1000) {
          const { data, error: failed } = (await getSupabase()
            .from(table)
            .select('target_id,member_id,emoji')
            .in('target_id', key.split(','))
            .order('target_id')
            .order('member_id')
            .range(offset, offset + 999)
            .abortSignal(controller.signal)) as {
            data: ReactionRow[] | null;
            error: Failure | null;
          };
          if (controller.signal.aborted || readVersion !== version.current) return;
          if (failed) {
            setSnapshot({ scope, rows: [] });
            setError(describeError(failed, 'Could not load reactions.'));
            return;
          }
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        setSnapshot({ scope, rows });
      } catch (e) {
        if (controller.signal.aborted || readVersion !== version.current) return;
        setSnapshot({ scope, rows: [] });
        setError(describeThrown(e, 'Could not load reactions.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [scope, memberId, key, table, attempt]);

  const choose = useCallback(
    async (target: string, emoji: ReactionEmoji | null) => {
      const token = `${scope}:${target}`;
      if (!memberId || !key.split(',').includes(target) || busy.current.has(token)) return false;
      busy.current.add(token);
      version.current += 1;
      setPending(new Set(busy.current));
      setFailure(null);
      try {
        const { error: failed } = await getSupabase().rpc('chat_set_reaction', {
          kind,
          target,
          reaction: emoji,
        });
        version.current += 1;
        if (currentScope.current !== scope) {
          reload();
          return false;
        }
        if (failed) {
          setFailure({ target, message: describeError(failed, 'Your reaction was not saved.') });
          return false;
        }
        setSnapshot((old) => ({
          scope,
          rows: [
            ...(old.scope === scope ? old.rows : []).filter(
              (r) => r.target_id !== target || r.member_id !== memberId,
            ),
            { target_id: target, member_id: memberId, emoji },
          ],
        }));
        announce(emoji ? 'Reaction saved.' : 'Reaction removed.');
        reload();
        return true;
      } catch (e) {
        if (currentScope.current === scope)
          setFailure({ target, message: describeThrown(e, 'Your reaction was not saved.') });
        return false;
      } finally {
        busy.current.delete(token);
        setPending(new Set(busy.current));
      }
    },
    [scope, memberId, key, kind, announce, reload],
  );
  return {
    rows: snapshot.scope === scope ? snapshot.rows : [],
    loading: loading || snapshot.scope !== scope,
    error,
    failure,
    pending: new Set(
      [...pending]
        .filter((token) => token.startsWith(`${scope}:`))
        .map((token) => token.slice(scope.length + 1)),
    ),
    choose,
    reload,
  };
}
