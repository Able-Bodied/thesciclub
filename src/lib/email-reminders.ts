import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Whether a member is emailed the day before an event they are going to
 * (20261028980000, the owner, 2026-10-28). On unless switched off on Me; the
 * member's own row, as Map visibility is.
 */
export function useEmailEventReminders(userId: string | null) {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getSupabase()
      .from('members')
      .select('email_event_reminders')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (cancelled) return;
        // A failure reads as on, the default, and the switch still works.
        const row = data as { email_event_reminders?: unknown } | null;
        setOn(readError ? true : row?.email_event_reminders !== false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const set = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      setError(null);
      const before = on;
      setOn(next);
      const { error: writeError } = await getSupabase()
        .from('members')
        .update({ email_event_reminders: next })
        .eq('id', userId);
      if (writeError) {
        setOn(before);
        setError(describeError(writeError, 'That was not changed.'));
      }
    },
    [userId, on],
  );

  return { on, error, set };
}
