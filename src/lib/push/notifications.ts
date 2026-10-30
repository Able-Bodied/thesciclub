import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { isNative, isStandalone } from '@/lib/standalone';
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
 *
 * The store app on an iPhone has no service worker; it asks iOS for a device
 * token instead (app-push.ts), kept by `push_subscribe_app` and sent to
 * through Apple. The same row, the same five states (never "install"), the
 * same asking. Android's app has no sender yet, so it neither asks nor shows
 * the row.
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

/** The store app on an iPhone, which notifies through Apple, not a service worker. */
export function isAppPush(): boolean {
  return isNative() && Capacitor.getPlatform() === 'ios';
}

/** The club can notify here: the iPhone app, or a website with the VAPID key. */
export function notificationsOffered(): boolean {
  return isAppPush() || (!isNative() && vapidPublicKey() !== null);
}

const loadApp = () => import('@/lib/push/app-push');

/**
 * The number on the app icon, where there is one: the iPhone app's
 * (app-push.ts), or a Home Screen app on iOS 16.4+ or installed Chrome. A push
 * sets it while the app is closed; src/lib/icon-badge.ts keeps it true while
 * open. 0 clears it. Never fails.
 */
export function showOnAppIcon(count: number): Promise<void> {
  if (isAppPush()) {
    return loadApp()
      .then((app) => app.setIconBadge(count))
      .catch(() => undefined);
  }
  // TypeScript's DOM library declares these everywhere; the platform has them
  // only where there is an icon to put a number on.
  if (isNative() || !('setAppBadge' in navigator)) return Promise.resolve();
  const pending = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  return pending.catch(() => undefined);
}

function canPush(): boolean {
  if (isNative()) return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * ---------------------------------------------------------------------------
 * Asking again, the first time the club is opened from the Home Screen
 * ---------------------------------------------------------------------------
 * The owner, 2026-10-05. On an iPhone, signing up happens in Safari, where
 * nothing can be asked: NotificationsStep says to add the club to the Home
 * Screen instead. Opened from there, the member signs in once more and used
 * to land on Home with nobody asking, the switch on Me their only way in. An
 * iPhone neither says when a web app is installed nor shows its permission
 * prompt without a tap, so the club asks when it can: the first time it is
 * running as the installed app and this phone has never been asked.
 *
 * "Not asked" is two things. The system's own permission is still
 * `default`: a yes or a no is the system's to remember, and asking after a no
 * does nothing. And this phone has not answered "Not now" in the last five
 * days, which only the club can remember, here, per device: after five days
 * the next opening asks again (the owner, 2026-10-21). When it cannot
 * remember (storage blocked), it does not ask: asking on every launch would
 * be worse than not asking.
 */
const ASKED_KEY = 'thesciclub.notificationsAsked';
export const ASK_AGAIN_AFTER_DAYS = 5;

export function notificationsAskedRecently(now: number = Date.now()): boolean {
  let stored: string | null;
  try {
    stored = localStorage.getItem(ASKED_KEY);
  } catch {
    return true;
  }
  if (stored === null) return false;
  const at = Date.parse(stored);
  return Number.isFinite(at) && now - at < ASK_AGAIN_AFTER_DAYS * 86_400_000;
}

export function markNotificationsAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, new Date().toISOString());
  } catch {
    // Nothing to do: notificationsAskedRecently says yes when it cannot read.
  }
}

export interface OpeningFacts {
  /** The club can send: `VITE_VAPID_PUBLIC_KEY` is set. */
  enabled: boolean;
  standalone: boolean;
  /** The system's permission, or null where there are no notifications at all. */
  permission: NotificationPermission | null;
  /** This phone answered "Not now" in the last five days. */
  askedRecently: boolean;
}

/** Pure: whether opening the club should ask first. Tested as a table. */
export function askOnOpening(facts: OpeningFacts): boolean {
  return (
    facts.enabled && facts.standalone && facts.permission === 'default' && !facts.askedRecently
  );
}

export function openingFacts(): OpeningFacts {
  return {
    enabled: vapidPublicKey() !== null,
    standalone: isStandalone(),
    permission: canPush() ? Notification.permission : null,
    askedRecently: notificationsAskedRecently(),
  };
}

// The app's first launch on a phone never asks: the member has only just
// arrived. Remembered per device; when it cannot be, it does not ask.
const APP_OPENED_KEY = 'thesciclub.appOpenedBefore';
let firstAppLaunch: boolean | null = null;

function isFirstAppLaunch(): boolean {
  if (firstAppLaunch === null) {
    try {
      firstAppLaunch = localStorage.getItem(APP_OPENED_KEY) === null;
      if (firstAppLaunch) localStorage.setItem(APP_OPENED_KEY, new Date().toISOString());
    } catch {
      firstAppLaunch = true;
    }
  }
  return firstAppLaunch;
}

/** openingFacts for the iPhone app, whose permission iOS answers asynchronously. */
export async function appOpeningFacts(): Promise<OpeningFacts> {
  const askedRecently = isFirstAppLaunch() || notificationsAskedRecently();
  const { appPermission } = await loadApp();
  return { enabled: true, standalone: true, permission: await appPermission(), askedRecently };
}

// A device preference belongs to an account, not everyone using this phone.
// Keep it through logout; browser permission alone is not consent for a new account.
const PREFERENCE_KEY = 'thesciclub.deviceNotifications.';

function rememberedPreference(userId: string): string | null {
  try {
    return localStorage.getItem(PREFERENCE_KEY + userId);
  } catch {
    return null;
  }
}

function rememberPreference(userId: string, enabled: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY + userId, enabled ? 'on' : 'off');
  } catch {
    // Restoring without a saved preference would opt in the wrong account.
  }
}

// Finish a subscription write before logout removes it. Likewise, a delayed
// logout cleanup must finish before the next login restores delivery.
let deviceWork: Promise<unknown> = Promise.resolve();
let revision = 0;

function inDeviceOrder<T>(action: () => Promise<T>): Promise<T> {
  const pending = deviceWork.then(action);
  deviceWork = pending.catch(() => undefined);
  return pending;
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

/**
 * The device can hold a subscription the club does not have for this member:
 * the sender deleted it after the push service said it was dead, or somebody
 * else signed in on this phone and took it over.
 */
async function heldBy(userId: string, endpoint: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('push_subscriptions')
    .select('endpoint')
    .eq('member_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** This iPhone's endpoint, or null when iOS has not been allowed to notify. */
async function appDeviceEndpoint(): Promise<string | null> {
  const app = await loadApp();
  if ((await app.appPermission()) !== 'granted') return null;
  return app.appEndpoint(await app.appToken());
}

async function readAppState(userId: string): Promise<NotificationState> {
  const { appPermission } = await loadApp();
  const permission = await appPermission();
  const endpoint = permission === 'granted' ? await appDeviceEndpoint() : null;
  const subscribed = endpoint !== null && (await heldBy(userId, endpoint));
  if (subscribed) rememberPreference(userId, true);
  return notificationState({ canPush: true, standalone: true, permission, subscribed });
}

export async function readDeviceState(userId: string): Promise<NotificationState> {
  if (isAppPush()) return readAppState(userId);
  const push = canPush();
  let subscribed = false;
  if (push) {
    const subscription = await currentSubscription();
    if (subscription) {
      subscribed = await heldBy(userId, subscription.endpoint);
      if (subscribed) rememberPreference(userId, true);
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

export async function turnOnNotifications(userId: string): Promise<Outcome> {
  if (isAppPush()) return turnOnApp(userId);
  const key = vapidPublicKey();
  if (!key || isNative()) return { ok: false, error: NOT_TURNED_ON };

  const requestedRevision = revision;
  // First, and before any await — see the header.
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { ok: true, state: 'refused' };
  if (permission !== 'granted') return { ok: true, state: 'off' };

  return inDeviceOrder(() =>
    requestedRevision === revision
      ? subscribeDevice(userId, key)
      : Promise.resolve<Outcome>({ ok: false, error: NOT_TURNED_ON }),
  );
}

async function subscribeDevice(userId: string, key: string): Promise<Outcome> {
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

  return registerSubscription(userId, subscription);
}

async function registerSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<Outcome> {
  // The account may have changed while waiting for the worker or the network.
  const { data, error: sessionError } = await getSupabase().auth.getSession();
  if (sessionError) throw sessionError;
  if (data.session?.user.id !== userId) return { ok: false, error: NOT_TURNED_ON };

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
  rememberPreference(userId, true);
  return { ok: true, state: 'on' };
}

async function turnOnApp(userId: string): Promise<Outcome> {
  const requestedRevision = revision;
  const app = await loadApp();
  const permission = await app.askAppPermission();
  if (permission === 'denied') return { ok: true, state: 'refused' };
  if (permission !== 'granted') return { ok: true, state: 'off' };
  return inDeviceOrder(() =>
    requestedRevision === revision
      ? subscribeApp(userId)
      : Promise.resolve<Outcome>({ ok: false, error: NOT_TURNED_ON }),
  );
}

async function subscribeApp(userId: string): Promise<Outcome> {
  const app = await loadApp();
  let token: string;
  try {
    token = await app.appToken();
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: `${NOT_TURNED_ON} This iPhone could not reach Apple’s notification service. Try again in a minute.`,
    };
  }

  // The account may have changed while waiting for Apple.
  const { data, error: sessionError } = await getSupabase().auth.getSession();
  if (sessionError) throw sessionError;
  if (data.session?.user.id !== userId) return { ok: false, error: NOT_TURNED_ON };

  const { error } = await getSupabase().rpc('push_subscribe_app', {
    app_token: token,
    app_environment: app.apnsEnvironment(),
    app_user_agent: navigator.userAgent,
  });
  if (error) return { ok: false, error: describeError(error, NOT_TURNED_ON) };
  rememberPreference(userId, true);
  return { ok: true, state: 'on' };
}

export function turnOffNotifications(userId: string): Promise<Outcome> {
  return inDeviceOrder(() => disableDevice(userId));
}

async function disableApp(userId: string): Promise<Outcome> {
  let endpoint: string | null;
  try {
    endpoint = await appDeviceEndpoint();
  } catch (e) {
    // Without the token there is no telling which row is this iPhone's.
    console.error(e);
    return { ok: false, error: 'Notifications are still on. Try again in a minute.' };
  }
  if (endpoint) {
    const { error } = await getSupabase()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('member_id', userId);
    if (error) return { ok: false, error: describeError(error, 'Notifications are still on.') };
  }
  rememberPreference(userId, false);
  return { ok: true, state: 'off' };
}

async function disableDevice(userId: string): Promise<Outcome> {
  if (isAppPush()) return disableApp(userId);
  const subscription = await currentSubscription();
  if (!subscription) {
    rememberPreference(userId, false);
    return { ok: true, state: 'off' };
  }

  // The row first: while it exists the sender can reach this phone, and if
  // deleting it fails the member must be told rather than shown "off".
  const { error } = await getSupabase()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)
    .eq('member_id', userId);
  if (error) return { ok: false, error: describeError(error, 'Notifications are still on.') };

  rememberPreference(userId, false);
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
 * Resume only this account's saved opt-in. Reuse the browser subscription:
 * Safari requires a tap to create a new one, even after permission was granted.
 * Never request permission or create a subscription during automatic restoration.
 */
export function restoreDeviceNotifications(userId: string): Promise<NotificationState> {
  const requestedRevision = revision;
  return inDeviceOrder(async () => {
    if (isAppPush())
      return requestedRevision === revision ? restoreApp(userId, requestedRevision) : 'off';
    if (!vapidPublicKey() || !canPush() || requestedRevision !== revision) return 'off';
    // On a cold PWA launch registration can still be starting. Wait only
    // for a saved opt-in, rather than missing its subscription on this visit.
    if (
      Notification.permission === 'granted' &&
      rememberedPreference(userId) === 'on' &&
      !(await readyWorker())
    )
      return 'off';
    if (requestedRevision !== revision) return 'off';
    const state = await readDeviceState(userId);
    if (state === 'on' || Notification.permission !== 'granted') return state;
    if (rememberedPreference(userId) !== 'on') return state;
    const subscription = await currentSubscription();
    if (!subscription || requestedRevision !== revision) return state;
    const key = vapidPublicKey();
    if (!key || !sameBytes(subscription.options.applicationServerKey, base64UrlToBytes(key))) {
      return state;
    }
    const outcome = await registerSubscription(userId, subscription);
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.state;
  });
}

/**
 * The app's restore: the token is asked of iOS on every launch and handed to
 * the club again if this account had notifications on, which also catches a
 * token that changed (a restored or reinstalled phone).
 */
async function restoreApp(userId: string, requestedRevision: number): Promise<NotificationState> {
  const state = await readAppState(userId);
  if (state !== 'off' || rememberedPreference(userId) !== 'on') return state;
  if ((await (await loadApp()).appPermission()) !== 'granted') return state;
  if (requestedRevision !== revision) return state;
  const outcome = await subscribeApp(userId);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.state;
}

/**
 * Pause delivery while signed out without undoing the account's device opt-in
 * or destroying its browser subscription. Bounded and best effort as before.
 */
export async function forgetThisDevice(): Promise<void> {
  revision += 1;
  // The next person on this phone does not see this member's count.
  const cleared = showOnAppIcon(0);
  if (!canPush() && !isAppPush()) return cleared;
  const attempt = inDeviceOrder(async () => {
    const { data, error: sessionError } = await getSupabase().auth.getSession();
    if (sessionError) throw sessionError;
    const userId = data.session?.user.id;
    if (!userId) return;
    let endpoint: string | null;
    if (isAppPush()) {
      // Whatever iOS's permission says now: a member who switched it off in
      // Settings still has a row, and the next person may switch it back on.
      // iOS hands out the token either way.
      const app = await loadApp();
      endpoint = app.appEndpoint(await app.appToken());
    } else {
      // Also preserves subscriptions enabled before device preferences existed.
      await readDeviceState(userId).catch((e: unknown) => {
        console.error(e);
      });
      endpoint = (await currentSubscription())?.endpoint ?? null;
    }
    if (!endpoint) return;
    const { error } = await getSupabase()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('member_id', userId);
    if (error) throw error;
  }).catch((e: unknown) => {
    console.error(e);
  });
  await Promise.race([
    Promise.all([attempt, cleared]),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

/** The row on Me: where this device stands, and the two things a member can do. */
export function useDeviceNotifications(userId: string | null) {
  const [state, setState] = useState<NotificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !notificationsOffered()) return;
    let live = true;
    restoreDeviceNotifications(userId)
      .then((next) => {
        if (live) setState(next);
      })
      .catch((e: unknown) => {
        if (live) setError(describeThrown(e, 'Could not check notifications on this device.'));
      });
    // Back from Settings, where the permission may have changed.
    function onVisible() {
      if (document.visibilityState !== 'visible' || !userId) return;
      readDeviceState(userId)
        .then((next) => {
          if (live) setState(next);
        })
        .catch((e: unknown) => {
          console.error(e);
        });
    }
    if (isAppPush()) document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
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
      if (userId) run(() => turnOnNotifications(userId));
    },
    turnOff: () => {
      if (userId) run(() => turnOffNotifications(userId));
    },
  };
}

/**
 * The kinds a member can switch off on Me — every kind that is not a
 * conversation, a topic or a room, which have Mute where they are.
 *
 * A row in `push_muted_kinds` is a kind switched off (20260927020000), so
 * off is an insert and on is a delete, never an upsert. `who` hides a switch
 * for a thing that never happens to this member: a peer is never told that
 * somebody they invited joined, because a peer cannot invite.
 */
export const NOTIFICATION_KINDS = [
  { kind: 'event_reminder', label: 'Events I am going to, the day before', who: 'all' },
  { kind: 'event_starting', label: 'Events I am going to, 10 minutes before', who: 'all' },
  { kind: 'org_events', label: 'New events from organizations I belong to', who: 'all' },
  { kind: 'grant_open', label: 'Grants opening from organizations I belong to', who: 'all' },
  { kind: 'profile_reminder', label: 'Reminders to finish my profile', who: 'all' },
  { kind: 'reply_participant', label: 'Replies in topics I have posted in', who: 'all' },
  { kind: 'like', label: 'Likes on my posts', who: 'all' },
  { kind: 'reaction', label: 'Reactions to my posts and messages', who: 'all' },
  { kind: 'mention', label: 'Being mentioned in a post', who: 'all' },
  { kind: 'group_add', label: 'Being added to a group', who: 'all' },
  { kind: 'introduction', label: 'Introductions to another member', who: 'all' },
  { kind: 'invite_joined', label: 'Somebody I invited joining', who: 'mentor' },
  { kind: 'invite_request', label: 'Somebody asking me for an invite', who: 'mentor' },
  { kind: 'report', label: 'New reports, and the weekly count of blocks', who: 'admin' },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['kind'];

export function useNotificationKinds(userId: string | null) {
  const [muted, setMuted] = useState<Set<NotificationKind> | null>(null);
  const [busy, setBusy] = useState<NotificationKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void getSupabase()
      .from('push_muted_kinds')
      .select('kind')
      .eq('member_id', userId)
      .then(({ data, error: readError }) => {
        if (!live) return;
        if (readError) {
          setError(describeError(readError, 'Could not read your notification settings.'));
          return;
        }
        setMuted(new Set((data as { kind: NotificationKind }[]).map((row) => row.kind)));
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const toggle = useCallback(
    (kind: NotificationKind) => {
      if (!userId || muted === null) return;
      const turningOff = !muted.has(kind);
      setBusy(kind);
      setError(null);
      const table = getSupabase().from('push_muted_kinds');
      const write = turningOff
        ? table.insert({ member_id: userId, kind })
        : table.delete().eq('member_id', userId).eq('kind', kind);
      void write
        .then(({ error: writeError }) => {
          // Already off, from another tab: that is what was asked for.
          if (writeError && writeError.code !== '23505') {
            setError(describeError(writeError, 'That setting was not changed.'));
            return;
          }
          setMuted((current) => {
            const next = new Set(current);
            if (turningOff) next.add(kind);
            else next.delete(kind);
            return next;
          });
        })
        .then(() => {
          setBusy(null);
        });
    },
    [userId, muted],
  );

  return { muted, busy, error, toggle };
}
