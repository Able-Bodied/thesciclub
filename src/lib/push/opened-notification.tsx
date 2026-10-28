import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { announceNotificationsChanged, markNotificationsReadByTag } from '@/lib/notifications';

/** The parameter push-notify adds to a notification's address (compose.ts). */
export const NOTIFICATION_PARAM = 'n';

/**
 * A pressed notification opens its address with its tag as `?n=`, on the web
 * (the service worker) and in the iPhone app alike. That one is marked read
 * and seen, so the icon and the bell drop by it alone, and the parameter
 * leaves the address. Mounted in the members' shell: signed out, the sign-in
 * door keeps the address, `n` and all, and comes back to it.
 */
export function OpenedNotification() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tag = params.get(NOTIFICATION_PARAM);
    if (tag === null) return;
    params.delete(NOTIFICATION_PARAM);
    const search = params.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state as unknown },
    );
    if (tag !== '') void markNotificationsReadByTag(tag).then(announceNotificationsChanged);
  }, [location, navigate]);

  return null;
}
