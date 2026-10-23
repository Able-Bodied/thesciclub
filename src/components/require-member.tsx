import { Fragment, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { SuspendedScreen } from '@/components/suspended-screen';
import { AccountProvider, useOwnAccount } from '@/lib/account';
import { resetAttachmentUrls } from '@/lib/chat/attachments';
import {
  claimEventRegistrations,
  fetchPublicEvent,
  forgetPendingRegistration,
  pendingRegistration,
} from '@/lib/event-audience';
import { restoreDeviceNotifications } from '@/lib/push/notifications';
import { forgetSharedReads } from '@/lib/shared-reads';
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
  const navigate = useNavigate();
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

  // Kept tabs and cached reads belong to one member. Signed out by any route
  // (another tab, an expired session) or another account: forget them.
  const lastMember = useRef<string | null>(null);
  useEffect(() => {
    if (status === 'loading' || status === 'error') return;
    const now = status === 'signed-out' ? null : account.userId;
    if (lastMember.current && lastMember.current !== now) {
      resetAttachmentUrls();
      forgetSharedReads();
    }
    lastMember.current = now;
  }, [status, account.userId]);

  // A registration made on a public event's page before signing in or joining
  // (src/lib/event-audience.ts): once a member, it becomes their RSVP, and the
  // event opens, now with who is going. Joining claims it in the database as
  // the member is made; signing in claims it here.
  const claimed = useRef(false);
  useEffect(() => {
    if (status !== 'member' || claimed.current) return;
    const pending = pendingRegistration();
    if (!pending) return;
    claimed.current = true;
    void claimEventRegistrations().then(() => {
      forgetPendingRegistration();
      void navigate(`/events/${pending.eventId}`, { replace: true });
    });
  }, [status, navigate]);

  if (status === 'error') return <AccountProblem account={account} />;

  if (status === 'loading') {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (status === 'signed-out' || status === 'signed-up') {
    const door = signInDoor(`${location.pathname}${location.search}${location.hash}`);
    // An event's own address, shared from the address bar: its public page
    // when it has one (20261022180000), the door otherwise.
    const eventId = EVENT_PATH.exec(location.pathname)?.[1];
    if (eventId) return <ToPublicEvent eventId={eventId} door={door} />;
    // Someone part-way through signup goes back to finish it, not to a wall.
    return <Navigate to={door} replace />;
  }
  // Not a redirect: there is nowhere to send them that is truer than this, and
  // bouncing a suspended member around the app while every screen comes back
  // empty is the behaviour this replaces.
  if (status === 'suspended') {
    return <SuspendedScreen />;
  }
  return (
    <AccountProvider account={account}>
      {/* A new member starts with nothing the last one left mounted. */}
      <Fragment key={account.userId}>{children}</Fragment>
    </AccountProvider>
  );
}

/** An event's page in the club, by id: `/events/<uuid>`, nothing after it. */
const EVENT_PATH = /^\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/**
 * Somebody signed out on an event's own address: the public page if the event
 * has one, which is what a member who copied the address bar meant to share;
 * the door if not, as for any other page in the club.
 */
function ToPublicEvent({ eventId, door }: { eventId: string; door: string }) {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchPublicEvent(eventId).then((result) => {
      if (!cancelled) setTo(result.ok && result.value ? `/e/${eventId}` : door);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, door]);
  if (!to) return <div className="min-h-dvh bg-canvas" />;
  return <Navigate to={to} replace />;
}
