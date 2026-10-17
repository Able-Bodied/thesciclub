import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { SuspendedScreen } from '@/components/suspended-screen';
import { AccountProvider, useOwnAccount } from '@/lib/account';
import { restoreDeviceNotifications } from '@/lib/push/notifications';
import { signInDoor } from '@/lib/sign-in-destination';

/**
 * The door.
 *
 * Nothing inside the club renders without a member row behind it — not even an
 * empty version of it. A tab that loads its chrome and then says "permission
 * denied" tells anybody who reaches it what exists inside, and it reads as a
 * broken app rather than a closed one.
 *
 * This is a convenience and not the security boundary. The boundary is RLS:
 * `browse_members` is granted to `authenticated` only, and every members policy
 * is own-row-only. Deleting this component would make the app rude, not
 * insecure.
 */
export function RequireMember({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // The one read for everything inside (AccountProvider), again on each
  // screen so a change to the member's own row is never more than a screen
  // old.
  const account = useOwnAccount({ refresh: location.pathname });
  const { status } = account;

  useEffect(() => {
    if (status !== 'member' || !account.userId) return;
    // Restore on entering the club, even if the member never visits Me.
    // After the first screen's own reads, which it would otherwise queue
    // behind on a slow connection.
    const userId = account.userId;
    const timer = window.setTimeout(() => {
      void restoreDeviceNotifications(userId).catch((error: unknown) => {
        console.error(error);
      });
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status, account.userId]);

  if (status === 'error') return <AccountProblem account={account} />;

  if (status === 'loading') {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (status === 'signed-out' || status === 'signed-up') {
    // Someone part-way through signup goes back to finish it, not to a wall.
    return (
      <Navigate to={signInDoor(`${location.pathname}${location.search}${location.hash}`)} replace />
    );
  }
  // Not a redirect: there is nowhere to send them that is truer than this, and
  // bouncing a suspended member around the app while every screen comes back
  // empty is the behaviour this replaces.
  if (status === 'suspended') {
    return <SuspendedScreen />;
  }
  return <AccountProvider account={account}>{children}</AccountProvider>;
}
