import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetRecoveryLink, recoveryLinkWorked, watchForRecoveryLink } from '@/lib/recovery-link';

/** A client whose auth events this file sends by hand. */
function fakeClient() {
  const listeners: ((event: string) => void)[] = [];
  const client = {
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  } as unknown as SupabaseClient;
  return {
    client,
    send: (event: string) => {
      for (const listener of listeners) listener(event);
    },
  };
}

beforeEach(() => {
  forgetRecoveryLink();
});

describe('whether a reset link worked on this visit', () => {
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
});
