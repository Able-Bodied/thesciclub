import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { getSupabase } from '@/lib/supabase';

const CHANGED = 'club-post-views-changed';

/** Refresh after the read-through write lands, so this visit is counted too. */
export function announcePostViewsChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Counts only: private reader identities never leave the database. */
export function usePostViews(postIds: readonly string[]) {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const key = [...new Set(postIds)].sort().join(',');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    byPost: new Map<string, number>(),
    loading: true,
  });

  useEffect(() => {
    const refresh = () => {
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
      setState({ byPost: new Map(), loading: false });
      return;
    }
    setState({ byPost: new Map(), loading: true });
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
        setState({
          byPost: new Map(rows.map((row) => [row.post_id, Number(row.view_count)])),
          loading: false,
        });
      } catch {
        if (!controller.signal.aborted) setState({ byPost: new Map(), loading: false });
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, key, attempt]);

  return state;
}
