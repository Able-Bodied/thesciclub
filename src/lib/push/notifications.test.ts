import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  base64UrlToBytes,
  type DeviceFacts,
  notificationState,
  turnOffNotifications,
  turnOnNotifications,
} from '@/lib/push/notifications';

/**
 * The pure half is a table. The browser half is driven through stubbed
 * globals — jsdom has no PushManager and no Notification, and the network
 * guard in setup.ts would refuse the real rpc anyway — to pin the two orders
 * that matter: permission before anything is awaited, and the row deleted
 * before the browser forgets the subscription.
 */

const calls = vi.hoisted(() => ({
  log: [] as string[],
  rpcError: null as { code: string; message: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.log.push(`rpc ${name} ${String(args.sub_endpoint)}`);
      return Promise.resolve({ error: calls.rpcError });
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          calls.log.push(`delete ${table} ${column}=${value}`);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const facts = (over: Partial<DeviceFacts>): DeviceFacts => ({
  canPush: true,
  standalone: true,
  permission: 'default',
  subscribed: false,
  ...over,
});

describe('notificationState', () => {
  it.each<[string, Partial<DeviceFacts>, string]>([
    ['an iPhone in a Safari tab', { canPush: false, standalone: false }, 'install'],
    [
      'an iPhone on the Home Screen before 16.4',
      { canPush: false, standalone: true },
      'unsupported',
    ],
    ['a device never asked', { permission: 'default' }, 'off'],
    [
      'a device that said yes and has a subscription on file',
      { permission: 'granted', subscribed: true },
      'on',
    ],
    // Permission is per origin and outlives the row: signing out deletes the
    // row and the next member on the phone has not turned anything on.
    ['a device that said yes whose subscription is not on file', { permission: 'granted' }, 'off'],
    ['a device that said no', { permission: 'denied' }, 'refused'],
    // "No" wins over a row the club still has, or the row would offer a
    // button the system will ignore.
    [
      'a device that said no after saying yes',
      { permission: 'denied', subscribed: true },
      'refused',
    ],
    ['a desktop browser tab', { standalone: false, permission: 'default' }, 'off'],
  ])('%s is %s', (_, over, expected) => {
    expect(notificationState(facts(over))).toBe(expected);
  });
});

describe('base64UrlToBytes', () => {
  it('reads base64url, unpadded, into bytes', () => {
    // "hi?" is 0x68 0x69 0x3f, which is "aGk_" in base64url and "aGk/" in base64.
    expect([...base64UrlToBytes('aGk_')]).toEqual([0x68, 0x69, 0x3f]);
    expect([...base64UrlToBytes('aGk')]).toEqual([0x68, 0x69]);
  });
});

describe('turning on and off', () => {
  const endpoint = 'https://web.push.apple.com/device-1';
  const subscription = {
    endpoint,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
    unsubscribe: () => {
      calls.log.push('unsubscribe');
      return Promise.resolve(true);
    },
  };
  let permission: NotificationPermission;

  beforeEach(() => {
    calls.log = [];
    calls.rpcError = null;
    permission = 'granted';
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ');
    vi.stubGlobal('Notification', {
      requestPermission: () => {
        calls.log.push('requestPermission');
        return Promise.resolve(permission);
      },
    });
    const registration = {
      pushManager: {
        getSubscription: () => {
          calls.log.push('getSubscription');
          return Promise.resolve(null);
        },
        subscribe: () => {
          calls.log.push('subscribe');
          return Promise.resolve(subscription);
        },
      },
    };
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      serviceWorker: {
        get ready() {
          calls.log.push('ready');
          return Promise.resolve(registration);
        },
        getRegistration: () =>
          Promise.resolve({
            pushManager: { getSubscription: () => Promise.resolve(subscription) },
          }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // iOS ignores a permission request that is not the direct result of a tap.
  // The call must happen before the first await, so it is first in the log
  // *synchronously* — before the returned promise has had a chance to run on.
  it('asks for permission before it awaits anything', async () => {
    const pending = turnOnNotifications();
    expect(calls.log).toEqual(['requestPermission']);
    await pending;
  });

  it('subscribes and hands the club the endpoint', async () => {
    expect(await turnOnNotifications()).toEqual({ ok: true, state: 'on' });
    expect(calls.log).toEqual([
      'requestPermission',
      'ready',
      'getSubscription',
      'subscribe',
      `rpc push_subscribe ${endpoint}`,
    ]);
  });

  it('stops at a no, and says it is refused rather than failing', async () => {
    permission = 'denied';
    expect(await turnOnNotifications()).toEqual({ ok: true, state: 'refused' });
    expect(calls.log).toEqual(['requestPermission']);
  });

  it('says what the club said when it refuses the subscription', async () => {
    calls.rpcError = {
      code: 'P0001',
      message: 'Notifications cannot be turned on while your membership is paused.',
    };
    expect(await turnOnNotifications()).toEqual({
      ok: false,
      error: 'Notifications cannot be turned on while your membership is paused.',
    });
  });

  it('does nothing while the club cannot send', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect((await turnOnNotifications()).ok).toBe(false);
    expect(calls.log).toEqual([]);
  });

  // While the row exists the sender can reach this phone. If the browser
  // forgot first and the delete then failed, the member would read "off" and
  // keep being notified.
  it('deletes the row before the browser forgets the subscription', async () => {
    expect(await turnOffNotifications()).toEqual({ ok: true, state: 'off' });
    expect(calls.log).toEqual([`delete push_subscriptions endpoint=${endpoint}`, 'unsubscribe']);
  });
});
