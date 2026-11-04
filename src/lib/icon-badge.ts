import { useEffect } from 'react';
import { useAccount } from '@/lib/account';
import { useBadgeCounts } from '@/lib/badges';
import { showOnAppIcon } from '@/lib/push/notifications';

/**
 * The number on the app icon while the app is open: how many kinds of
 * notification the bell has not shown yet (20261028010000), the number every
 * push carries. The bell's list clears it all; opening one conversation, topic
 * or pressed push clears that one (20261028900000).
 * Mounted once, in the tab bar, which is on every screen. Counted with the
 * other badges in one request (src/lib/badges.ts).
 */
export function useIconBadge(): void {
  const account = useAccount();
  const { iconKinds, loaded } = useBadgeCounts();
  const member = account.status === 'member';

  useEffect(() => {
    // Until the first answer, the icon keeps what the last push said.
    if (member && loaded) void showOnAppIcon(iconKinds);
  }, [member, loaded, iconKinds]);
}
