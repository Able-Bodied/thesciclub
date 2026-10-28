import { useCallback, useEffect } from 'react';
import { useAccount } from '@/lib/account';
import { useRealtimeRows } from '@/lib/chat/realtime';
import type { Failure } from '@/lib/describe-error';
import { NOTIFICATIONS_CHANGED } from '@/lib/notifications';
import { showOnAppIcon } from '@/lib/push/notifications';
import { getSupabase } from '@/lib/supabase';

/**
 * The number on the app icon while the app is open: how many kinds of
 * notification the bell has not shown yet (20261028010000), the number every
 * push carries. The bell's list clears it all; opening one conversation, topic
 * or pressed push clears that one (20261028900000).
 * Mounted once, in the tab bar, which is on every screen.
 */
export function useIconBadge(): void {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const refresh = useCallback(() => {
    if (!memberId) return;
    void (
      getSupabase().rpc('my_unseen_notification_kinds') as unknown as Promise<{
        data: number | null;
        error: Failure | null;
      }>
    )
      .then(({ data, error }) => {
        // Until the function is live, the icon keeps what the last push said.
        if (!error) void showOnAppIcon(data ?? 0);
      })
      .catch(() => undefined);
  }, [memberId]);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [refresh]);

  useRealtimeRows({
    table: 'notifications',
    filter: memberId ? `member_id=eq.${memberId}` : undefined,
    onChange: refresh,
    enabled: memberId !== null,
  });
}
