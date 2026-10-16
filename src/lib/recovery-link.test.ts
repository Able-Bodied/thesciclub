import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetRecoveryLink,
  RECOVERY_LIFE_MS,
  recoveryLinkWorked,
  watchForRecoveryLink,
} from '@/lib/recovery-link';

type Listener = (event: string, session: { user: { id: string } } | null) => void;

/** A client whose auth events this file sends by hand. */
function fakeClient() {
  const listeners: Listener[] = [];
  const client = {
    auth: {
      onAuthStateChange: (listener: Listener) => {
        listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  } as unknown as SupabaseClient;
  return {
    client,
    send: (event: string, userId: string | null = 'dana') => {
      for (const listener of listeners) listener(event, userId ? { user: { id: userId } } : null);
    },
  };
}

beforeEach(() => {
  forgetRecoveryLink();
  window.history.replaceState(null, '', '/reset-password');
});
afterEach(() => {
  vi.resetModules();
});

describe('whether a reset link worked in this tab', () => {
  it('is no until the client says a recovery link was read', () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    expect(recoveryLinkWorked()).toBe(false);
    send('INITIAL_SESSION');
    send('SIGNED_IN');
    send('TOKEN_REFRESHED');
    expect(recoveryLinkWorked()).toBe(false);
    send('PASSWORD_RECOVERY');
    expect(recoveryLinkWorked()).toBe(true);
  });

  it('is no again once the password is saved', () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    send('PASSWORD_RECOVERY');
    forgetRecoveryLink();
    expect(recoveryLinkWorked()).toBe(false);
  });

  // The owner, 2026-10-15: after a release the page reloads as soon as the
  // link has been read, and the reload said the link no longer worked.
  it('is still yes after the page reloads', async () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    send('PASSWORD_RECOVERY');

    vi.resetModules();
    const reloaded = await import('@/lib/recovery-link');
    const again = fakeClient();
    reloaded.watchForRecoveryLink(again.client);
    again.send('INITIAL_SESSION');
    expect(reloaded.recoveryLinkWorked()).toBe(true);
  });

  it('is not believed past a link’s hour', () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    send('PASSWORD_RECOVERY');
    expect(recoveryLinkWorked(Date.now() + RECOVERY_LIFE_MS - 1000)).toBe(true);
    expect(recoveryLinkWorked(Date.now() + RECOVERY_LIFE_MS + 1000)).toBe(false);
  });

  it('ends when a dead link is opened in the same tab', async () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    send('PASSWORD_RECOVERY');

    window.history.replaceState(
      null,
      '',
      '/reset-password#error=access_denied&error_code=otp_expired',
    );
    vi.resetModules();
    const reloaded = await import('@/lib/recovery-link');
    reloaded.watchForRecoveryLink(fakeClient().client);
    expect(reloaded.recoveryLinkWorked()).toBe(false);
  });

  it('ends on signing out, or when another account signs in', () => {
    const { client, send } = fakeClient();
    watchForRecoveryLink(client);
    send('PASSWORD_RECOVERY', 'dana');
    send('TOKEN_REFRESHED', 'dana');
    expect(recoveryLinkWorked()).toBe(true);
    send('SIGNED_IN', 'bo');
    expect(recoveryLinkWorked()).toBe(false);

    send('PASSWORD_RECOVERY', 'dana');
    send('SIGNED_OUT', null);
    expect(recoveryLinkWorked()).toBe(false);
  });
});
