import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useKeptRead } from '@/lib/kept-reads';
import { onReturnSettled, returnPending } from '@/lib/page-return';
import { getSupabase } from '@/lib/supabase';

const CHANGED = 'club-post-views-changed';

/** Refresh after the read-through write lands, so this visit is counted too. */
export function announcePostViewsChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** How long a topic waits for its visit to be counted before reading anyway. */
export const VISIT_WAIT_MS = 3000;

/**
 * Counts only: private reader identities never leave the database.
 * `afterVisit` (a topic): the first read waits for this visit's read-through
 * write, which says so (announcePostViewsChanged); a read before it is
 * replaced a moment later.
 */
export function usePostViews(
  postIds: readonly string[],
  { afterVisit = false }: { afterVisit?: boolean } = {},
) {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const key = [...new Set(postIds)].sort().join(',');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    byPost: new Map<string, number>(),
    loading: true,
  });
  // Read again for the same posts, the counts stay up until the new ones land.
  const shown = useRef<string | null>(null);
  const kept = useKeptRead();
  const [visited, setVisited] = useState(!afterVisit);
  // New posts on a return wait for its read mark, then read once.
  const waited = useRef(false);

  useEffect(
    () =>
      onReturnSettled(() => {
        if (!waited.current) return;
        waited.current = false;
        setAttempt((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    if (visited) return;
    const timer = window.setTimeout(() => {
      setVisited(true);
    }, VISIT_WAIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [visited]);

  useEffect(() => {
    const refresh = () => {
      setVisited(true);
      setAttempt((n) => n + 1);
    };
    window.addEventListener(CHANGED, refresh);
    return () => {
      window.removeEventListener(CHANGED, refresh);
    };
  }, []);

  useEffect(() => {
    if (attempt < 0) return;
    const controller = new AbortController();
    if (!memberId || !key) {
      shown.current = null;
      setState({ byPost: new Map(), loading: false });
      return;
    }
    const again = shown.current === key;
    if (!again) setState({ byPost: new Map(), loading: true });
    if (!visited) return;
    if (returnPending()) {
      waited.current = true;
      return;
    }
    // A kept tab shown again within the minute (lib/kept-reads.ts).
    const read = `${memberId}|${key}|${attempt}`;
    if (kept.fresh(read)) return;
    const landed = kept.start(read);
    async function load() {
      try {
        // Supabase caps returned rows at 1,000; long topics still need a
        // count on every delivered post, including the last reply.
        const ids = key.split(',');
        const requests = [];
        for (let offset = 0; offset < ids.length; offset += 500) {
          requests.push(
            getSupabase()
              .rpc('chat_post_view_counts', { post_ids: ids.slice(offset, offset + 500) })
              .abortSignal(controller.signal),
          );
        }
        const results = (await Promise.all(requests)) as {
          data: { post_id: string; view_count: number | string }[] | null;
          error: unknown;
        }[];
        if (controller.signal.aborted) return;
        const rows = results.flatMap(({ data, error }) => (error ? [] : (data ?? [])));
        shown.current = key;
        setState({
          byPost: new Map(rows.map((row) => [row.post_id, Number(row.view_count)])),
          loading: false,
        });
        landed();
      } catch {
        if (!controller.signal.aborted && !again) setState({ byPost: new Map(), loading: false });
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, key, attempt, visited, kept]);

  return state;
}
