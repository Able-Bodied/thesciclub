import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/** The opening post for each room topic, never a reply replacing a removed opener. */
export function useTopicOpeningPosts(topicIds: readonly string[]) {
  const key = [...new Set(topicIds)].sort().join(',');
  const [byTopic, setByTopic] = useState(new Map<string, string | null>());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt < 0) return;
    const controller = new AbortController();
    setByTopic(new Map());
    if (!key) return;
    async function load() {
      try {
        const { data, error } = (await getSupabase()
          .rpc('chat_topic_opening_posts', { topic_ids: key.split(',') })
          .abortSignal(controller.signal)) as {
          data: { topic_id: string; post_id: string | null }[] | null;
          error: unknown;
        };
        if (controller.signal.aborted || error) return;
        const rows = data ?? [];
        setByTopic(new Map(rows.map((row) => [row.topic_id, row.post_id])));
      } catch {
        // Keep the topic links usable even when their post actions cannot load.
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [key, attempt]);
  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return { byTopic, reload };
}
