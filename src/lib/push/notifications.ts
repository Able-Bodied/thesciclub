import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Turning notifications on and off for the device in the member's hand.
 *
 * The third piece of notifications (HANDOFF.md, "Next up: notifications on an
 * iPhone"). The service worker can show one and `push_subscriptions` can hold
 * the address; this is the member saying yes. Screen tests stub this module:
 * `pushManager` and the rpc are both the network.
 *
 * ---------------------------------------------------------------------------
 * Not drawn until something can send
 * ---------------------------------------------------------------------------
 * A switch that turns on notifications nobody sends is the screen that looks
 * finished and does nothing, which CONTEXT.md rules out. The row appears only
 * when `VITE_VAPID_PUBLIC_KEY` is set, and that key goes into Netlify on the
 * day the sender does — it is the one switch for the whole feature.
 *
 * ---------------------------------------------------------------------------
 * The five states, and why an iPhone needs two of them
 * ---------------------------------------------------------------------------
 * iOS gives a web app push only once it is on the Home Screen: in a Safari tab
 * `PushManager` does not exist. So "cannot" splits in two — *install* (a tab;
 * say how to add it) and *unsupported* (already installed, and still cannot:
 * iOS before 16.4). The other three are the permission: *off* (not asked, or
 * turned off here), *on*, and *refused* (the system will not ask again, so the
 * row says where in Settings it is changed rather than offering a button that
 * does nothing).
 *
 * ---------------------------------------------------------------------------
 * The permission is asked first, inside the tap
 * ---------------------------------------------------------------------------
 * iOS ignores a permission request that is not the direct result of a tap, and
 * awaiting anything first — the service worker, a network read — can be enough
 * to lose the gesture. So `turnOn` calls `Notification.requestPermission()`
 * before it awaits anything else. Do not move it.
 */

export type NotificationState = 'install' | 'unsupported' | 'off' | 'on' | 'refused';

export interface DeviceFacts {
  /** A service worker, `PushManager` and `Notification` all exist here. */
  canPush: boolean;
  /** Running as the installed app rather than in a browser tab. */
  standalone: boolean;
  permission: NotificationPermission;
  /** This browser holds a subscription and the club has it on file as the viewer's. */
  subscribed: boolean;
}

/** Pure: which of the five the row is in. Tested as a table. */
export function notificationState(facts: DeviceFacts): NotificationState {
  if (!facts.canPush) return facts.standalone ? 'unsupported' : 'install';
  if (facts.permission === 'denied') return 'refused';
  if (facts.permission === 'granted' && facts.subscribed) return 'on';
  return 'off';
}

/** The public half of the VAPID pair, or null while the feature is switched off. */
export function vapidPublicKey(): string | null {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return key && key.trim() !== '' ? key.trim() : null;
}

/** base64url → bytes, which is how `applicationServerKey` is safest handed over. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (a?.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

function canPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isStandalone(): boolean {
  // `navigator.standalone` is Safari's own, and older than the media query.
  const safari = (navigator as Navigator & { standalone?: boolean }).standalone;
  return safari === true || window.matchMedia('(display-mode: standalone)').matches;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * The worker, once it is running. `ready` never settles where none was
 * registered — the dev server, or the first seconds of a first visit — so it
 * is raced against a clock rather than awaited on its own.
 */
async function readyWorker(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        resolve(null);
      }, 10_000),
    ),
  ]);
}

export async function readDeviceState(userId: string): Promise<NotificationState> {
  const push = canPush();
  let subscribed = false;
  if (push) {
    const subscription = await currentSubscription();
    if (subscription) {
      // The browser can hold a subscription the club does not have for this
      // member: the sender deleted it after the push service said it was dead,
      // or somebody else signed in on this phone and took it over.
      const { data } = await getSupabase()
        .from('push_subscriptions')
        .select('endpoint')
        .eq('member_id', userId)
        .eq('endpoint', subscription.endpoint)
        .maybeSingle();
      subscribed = data !== null;
    }
  }
  return notificationState({
    canPush: push,
    standalone: isStandalone(),
    permission: push ? Notification.permission : 'default',
    subscribed,
  });
}

export type Outcome = { ok: true; state: NotificationState } | { ok: false; error: string };

const NOT_TURNED_ON = 'Notifications were not turned on.';

export async function turnOnNotifications(): Promise<Outcome> {
  const key = vapidPublicKey();
  if (!key) return { ok: false, error: NOT_TURNED_ON };

  // First, and before any await — see the header.
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { ok: true, state: 'refused' };
  if (permission !== 'granted') return { ok: true, state: 'off' };

  const registration = await readyWorker();
  if (!registration) {
    return {
      ok: false,
      error: `${NOT_TURNED_ON} The club is still starting up. Try again in a minute.`,
    };
  }

  let subscription: PushSubscription;
  try {
    const serverKey = base64UrlToBytes(key);
    let existing = await registration.pushManager.getSubscription();
    // A subscription made under another key cannot be sent to with ours; the
    // push service refuses it. Only happens if the key is ever changed.
    if (existing && !sameBytes(existing.options.applicationServerKey, serverKey)) {
      await existing.unsubscribe();
      existing = null;
    }
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      }));
  } catch (e) {
    // The browser's own words ("Registration failed - push service error")
    // are not a sentence a member can act on.
    console.error(e);
    return {
      ok: false,
      error: `${NOT_TURNED_ON} This device could not reach its notification service. Try again in a minute.`,
    };
  }

  const { endpoint, keys } = subscription.toJSON();
  const { error } = await getSupabase().rpc('push_subscribe', {
    sub_endpoint: endpoint ?? '',
    sub_p256dh: keys?.p256dh ?? '',
    sub_auth: keys?.auth ?? '',
    sub_user_agent: navigator.userAgent,
  });
  if (error) {
    return {
      ok: false,
      error: describeError(error, {
        attempt: NOT_TURNED_ON,
        constraints: {
          push_subscriptions_keys_check: 'This browser sent a key the club could not use.',
        },
      }),
    };
  }
  return { ok: true, state: 'on' };
}

export async function turnOffNotifications(): Promise<Outcome> {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true, state: 'off' };

  // The row first: while it exists the sender can reach this phone, and if
  // deleting it fails the member must be told rather than shown "off".
  const { error } = await getSupabase()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint);
  if (error) return { ok: false, error: describeError(error, 'Notifications are still on.') };

  try {
    await subscription.unsubscribe();
  } catch (e) {
    // Nothing is sent to an endpoint the club no longer has, so this is tidy
    // rather than necessary.
    console.error(e);
  }
  return { ok: true, state: 'off' };
}

/**
 * On sign-out: this phone stops notifying the member leaving it.
 *
 * Best effort and quick — it must never be the reason sign-out hangs or fails,
 * so it gives up after a few seconds and swallows every error.
 * `push_subscribe` taking the endpoint over is the backstop for the times this
 * does not run at all.
 */
export async function forgetThisDevice(): Promise<void> {
  if (!canPush()) return;
  const attempt = turnOffNotifications().catch((e: unknown) => {
    console.error(e);
  });
  await Promise.race([attempt, new Promise((resolve) => setTimeout(resolve, 3_000))]);
}

/** The row on Me: where this device stands, and the two things a member can do. */
export function useDeviceNotifications(userId: string | null) {
  const [state, setState] = useState<NotificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !vapidPublicKey()) return;
    let live = true;
    readDeviceState(userId)
      .then((next) => {
        if (live) setState(next);
      })
      .catch((e: unknown) => {
        if (live) setError(describeThrown(e, 'Could not check notifications on this device.'));
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const run = useCallback((action: () => Promise<Outcome>) => {
    setBusy(true);
    setError(null);
    action()
      .then((outcome) => {
        if (outcome.ok) setState(outcome.state);
        else setError(outcome.error);
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Something went wrong with notifications.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  return {
    /** Null while switched off for the whole club, or still being read. */
    state,
    busy,
    error,
    turnOn: () => {
      run(turnOnNotifications);
    },
    turnOff: () => {
      run(turnOffNotifications);
    },
  };
}
