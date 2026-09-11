import { Navigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';

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
  const { status } = useAccount();

  if (status === 'loading') {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (status === 'signed-out' || status === 'signed-up') {
    // Someone part-way through signup goes back to finish it, not to a wall.
    return <Navigate to="/join" replace />;
  }
  return <>{children}</>;
}
