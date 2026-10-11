import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Joining and signing in by email.
 *
 * What is worth proving here is the order: nobody is told whether an address
 * is on the list until they are signed in, the invite link is claimed before
 * the list is consulted, and every way in ends at the same check.
 */

const calls = vi.hoisted(() => {
  const account = (): { email: string; user_metadata: Record<string, unknown> } => ({
    email: 'dana@example.com',
    user_metadata: {},
  });
  return {
    account,
    order: [] as string[],
    listeners: new Set<() => void>(),
    status: 'signed-out',
    /** What a successful password sign-in makes the account: a stranger to the club, or a member. */
    afterPassword: 'signed-up',
    passwordError: null as { message: string; code?: string } | null,
    signUpError: null as { message: string; code?: string } | null,
    resendError: null as { message: string; code?: string } | null,
    resetError: null as { message: string; code?: string } | null,
    signUpOptions: null as { emailRedirectTo?: string } | null,
    resetRedirect: null as string | null,
    /** The signed-in account, as the session shows it. */
    user: account(),
    invited: true,
    claimResult: true,
    claimError: false,
    claimedWith: null as string | null,
    /** Usernames the club says are taken. */
    taken: [] as string[],
    suggestions: ['dana', 'dana.s', 'dana_s'] as string[],
    checked: [] as string[],
    submitted: null as Record<string, unknown> | null,
    /** What each submit answers, in turn; ok when the list runs out. */
    submitResults: [] as {
      ok: boolean;
      error?: string;
      photoRefused?: boolean;
      usernameRefused?: boolean;
    }[],
    /** Null is the club unable to send, which is the default for these tests. */
    vapidKey: null as string | null,
    notificationState: 'off',
    /** Whether Google's script loaded; 'unavailable' shows the club's button. */
    widget: 'unavailable',
    onToken: null as ((token: string, nonce: string) => void) | null,
    promptAsked: false,
    idTokenError: null as string | null,
    passkeyError: null as { name?: string; message: string } | null,
    setStatus(next: string) {
      calls.status = next;
      for (const listener of calls.listeners) listener();
    },
  };
});

vi.mock('@/lib/google-identity', () => ({
  useGoogleButton: ({
    onToken,
    prompt,
  }: {
    onToken: (token: string, nonce: string) => void;
    prompt?: boolean;
  }) => {
    calls.onToken = onToken;
    calls.promptAsked = Boolean(prompt);
    return { ref: { current: null }, state: calls.widget };
  },
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: [
      {
        id: 'ncs',
        shortCode: 'NCS',
        name: 'NorCal SCI',
        city: 'Northern California',
        description: 'Peer mentoring, support groups and a regional events calendar.',
        tags: [],
        canInvite: true,
        logoPath: null,
      },
      {
        id: 'wwm',
        shortCode: 'WWM',
        name: 'Wheel with Me Foundation',
        city: 'East Bay',
        description: 'Grants and adaptive sport programming.',
        tags: [],
        canInvite: false,
        logoPath: null,
      },
    ],
    byId: new Map(),
    loading: false,
    error: null,
  }),
}));

// The insert itself is covered by submit-onboarding's own tests; what this
// file cares about is which answers reach it.
vi.mock('@/routes/onboarding/submit-onboarding', () => ({
  submitOnboarding: (data: Record<string, unknown>) => {
    calls.submitted = data;
    return Promise.resolve(calls.submitResults.shift() ?? { ok: true });
  },
}));

// A real subscription, so an account that changes while the page is open
// (a sign-in that succeeds) reaches the screen as it does in the app.
vi.mock('@/lib/account', async () => {
  const { useEffect, useReducer } = await import('react');
  return {
    useAccount: () => {
      const [, bump] = useReducer((n: number) => n + 1, 0);
      useEffect(() => {
        calls.listeners.add(bump);
        return () => {
          calls.listeners.delete(bump);
        };
      }, []);
      return { status: calls.status, userId: null, isAdmin: false, displayName: null };
    },
    signOut: () => {
      calls.order.push('signOut');
      calls.setStatus('signed-out');
      return Promise.resolve({ ok: true });
    },
  };
});

// The device and the push service are the network; the screen's own choices
// are what is tested here. See notifications-step.tsx.
vi.mock('@/lib/push/notifications', () => ({
  vapidPublicKey: () => calls.vapidKey,
  markNotificationsAsked: () => {
    calls.order.push('asked');
  },
  useDeviceNotifications: () => ({
    state: calls.notificationState,
    busy: false,
    error: null,
    turnOn: () => {
      calls.order.push('turnOn');
    },
    turnOff: () => undefined,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithOAuth: (options: { provider: string; options?: { redirectTo?: string } }) => {
        calls.order.push(`signInWithOAuth:${options.provider}`);
        return Promise.resolve({ error: null });
      },
      signInWithIdToken: (options: { provider: string; token: string; nonce: string }) => {
        calls.order.push(`signInWithIdToken:${options.provider}:${options.token}:${options.nonce}`);
        return Promise.resolve({
          error: calls.idTokenError ? { message: calls.idTokenError } : null,
        });
      },
      getSession: () =>
        Promise.resolve({
          data: { session: { user: calls.user } },
        }),
      signInWithPassword: (credentials: { email: string; password: string }) => {
        calls.order.push(`signInWithPassword:${credentials.email}`);
        if (calls.passwordError) return Promise.resolve({ error: calls.passwordError });
        calls.setStatus(calls.afterPassword);
        return Promise.resolve({ error: null });
      },
      signUp: (credentials: {
        email: string;
        password: string;
        options?: { emailRedirectTo?: string };
      }) => {
        calls.order.push(`signUp:${credentials.email}`);
        calls.signUpOptions = credentials.options ?? null;
        return Promise.resolve({
          error: calls.signUpError,
        });
      },
      resend: (options: { type: string; email: string }) => {
        calls.order.push(`resend:${options.type}:${options.email}`);
        return Promise.resolve({ error: calls.resendError });
      },
      resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => {
        calls.order.push(`resetPasswordForEmail:${email}`);
        calls.resetRedirect = options?.redirectTo ?? null;
        return Promise.resolve({ error: calls.resetError });
      },
      signInWithPasskey: () => {
        calls.order.push('signInWithPasskey');
        return Promise.resolve({ error: calls.passkeyError });
      },
      registerPasskey: () => {
        calls.order.push('registerPasskey');
        return Promise.resolve({ error: calls.passkeyError });
      },
    },
    // rpc() is awaited as it is, and `.single()` is chained on the one that
    // returns a row; both are the same answer here.
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.order.push(name);
      let result: { data: unknown; error: unknown } = { data: null, error: null };
      if (name === 'my_invite_status') result = { data: { invited: calls.invited }, error: null };
      if (name === 'claim_invite') {
        calls.claimedWith = String(args?.token);
        result = calls.claimError
          ? { data: null, error: { message: 'offline' } }
          : { data: calls.claimResult, error: null };
      }
      if (name === 'suggest_usernames') result = { data: calls.suggestions, error: null };
      if (name === 'username_available') {
        const asked = String(args?.name);
        calls.checked.push(asked);
        result = { data: !calls.taken.includes(asked), error: null };
      }
      return Object.assign(Promise.resolve(result), { single: () => Promise.resolve(result) });
    },
  }),
}));

const { default: OnboardingPage } = await import('@/routes/onboarding/page');

// Real routes, so a test can see where somebody lands: Home, since step 5
// of HANDOFF.md "What Home is". Until then it was Peers.
function renderJoin(path = '/join') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join" element={<OnboardingPage />} />
        <Route path="/home" element={<h1>Home</h1>} />
        <Route path="/chat/t/shared" element={<h1>Shared conversation</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Signed in as an invited stranger to the club, and agreed: on the name step. */
async function reachName() {
  calls.status = 'signed-up';
  renderJoin();
  await userEvent.click(await screen.findByRole('checkbox', { name: /I agree to the Terms/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByPlaceholderText('Alex');
}

/** Through the name and the username, to the birthday. */
async function reachBirthday(name: string) {
  await reachName();
  await userEvent.clear(screen.getByPlaceholderText('Alex'));
  await userEvent.type(screen.getByPlaceholderText('Alex'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.click(await screen.findByRole('button', { name: '@dana' }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('When is your birthday?');
}

/** Fills the birthday's three boxes from an ISO date, all at once. */
async function enterBirthday(iso: string) {
  const [year = '', month = '', day = ''] = iso.split('-');
  fireEvent.change(await screen.findByLabelText('Month'), { target: { value: month } });
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: day } });
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: year } });
}

/** Types an ISO date into the birthday's boxes a key at a time, as a person would. */
async function typeBirthday(iso: string) {
  const [year = '', month = '', day = ''] = iso.split('-');
  await userEvent.type(await screen.findByLabelText('Month'), month);
  await userEvent.type(screen.getByLabelText('Day'), day);
  await userEvent.type(screen.getByLabelText('Year'), year);
}

/** Fills the sign-in or join form. The join form also asks for the password twice. */
async function fillDoor(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  const again = screen.queryByLabelText('Type it again');
  if (again) await userEvent.type(again, password);
}

beforeEach(() => {
  window.localStorage.clear();
  calls.order = [];
  calls.status = 'signed-out';
  calls.afterPassword = 'signed-up';
  calls.passwordError = null;
  calls.signUpError = null;
  calls.resendError = null;
  calls.resetError = null;
  calls.signUpOptions = null;
  calls.resetRedirect = null;
  calls.user = { email: 'dana@example.com', user_metadata: {} };
  calls.invited = true;
  calls.claimResult = true;
  calls.claimError = false;
  calls.claimedWith = null;
  calls.taken = [];
  calls.suggestions = ['dana', 'dana.s', 'dana_s'];
  calls.checked = [];
  calls.submitted = null;
  calls.submitResults = [];
  calls.vapidKey = null;
  calls.notificationState = 'off';
  calls.widget = 'unavailable';
  calls.onToken = null;
  calls.promptAsked = false;
  calls.idTokenError = null;
  calls.passkeyError = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(window, 'PublicKeyCredential');
});

describe('the welcome screen', () => {
  it('starts on the welcome screen, not on a form', () => {
    renderJoin();
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument();
    // The logo carries "MEMBERS ONLY" too, so match the footer line whole.
    expect(
      screen.getByText(/Members only\. Nothing inside the club is public\./),
    ).toBeInTheDocument();
  });

  it('shows the club mark and offers both doors', () => {
    renderJoin();
    expect(screen.getByRole('img', { name: 'The SCI Club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument();
  });
});

describe('joining by email', () => {
  async function openJoin(path = '/join') {
    renderJoin(path);
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
  }

  it('signs up with a lowercase address and has the link come back to /join', async () => {
    await openJoin();
    await fillDoor('Dana@Example.com ', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(calls.order).toEqual(['signUp:dana@example.com']);
    expect(calls.signUpOptions?.emailRedirectTo).toContain('/join?confirmed=1');
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
  });

  it('will not sign up with a password under eight characters', async () => {
    await openJoin();
    await fillDoor('dana@example.com', 'seven77');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Password'), '8');
    // Typed once more: the second field still says the old, shorter one.
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type it again'), '8');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  describe('typing the password twice', () => {
    it('asks for it again on joining, with the right autocomplete', async () => {
      await openJoin();
      const again = screen.getByLabelText('Type it again');
      expect(again).toHaveAttribute('type', 'password');
      expect(again).toHaveAttribute('autocomplete', 'new-password');
    });

    it('says they do not match as an alert, and will not create the account', async () => {
      await openJoin();
      await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'a long password');
      await userEvent.type(screen.getByLabelText('Type it again'), 'a long passwor');
      expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.');
      expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
      expect(calls.order.filter((c) => c.startsWith('signUp'))).toEqual([]);
    });

    it('goes on once they match', async () => {
      await openJoin();
      await fillDoor('dana@example.com', 'a long password');
      expect(screen.queryByText('The two passwords do not match.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    });

    it('does not submit a mismatch with Enter either', async () => {
      await openJoin();
      await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'a long password');
      await userEvent.type(screen.getByLabelText('Type it again'), 'another long one{Enter}');
      expect(calls.order.filter((c) => c.startsWith('signUp'))).toEqual([]);
    });

    it('keeps sign-in to one password field', async () => {
      renderJoin('/join');
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.queryByLabelText('Type it again')).toBeNull();
    });
  });

  it('never asks whether the address is invited before it is confirmed', async () => {
    await openJoin();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your email');
    expect(calls.order.filter((c) => c === 'my_invite_status' || c === 'claim_invite')).toEqual([]);
  });

  it('says what went wrong when the sign-up is refused', async () => {
    calls.signUpError = {
      message: 'Signups not allowed for this instance',
      code: 'signup_disabled',
    };
    await openJoin();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Check your email')).toBeNull();
  });

  // The sentences for what Supabase really returns, on the three screens that
  // send an email: sign-up, resend, and Forgot password.
  describe('the email errors, in words', () => {
    const TOO_MANY = 'Too many attempts or emails. Wait a minute and try again.';
    const NOT_SENT = 'The email could not be sent. Try again in a minute.';

    it('sign-up: too many emails', async () => {
      calls.signUpError = {
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      };
      await openJoin();
      await fillDoor('dana@example.com', 'a long password');
      await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(TOO_MANY);
    });

    it('sign-up: the confirmation email could not be sent', async () => {
      calls.signUpError = {
        code: 'unexpected_failure',
        message: 'Error sending confirmation email',
      };
      await openJoin();
      await fillDoor('dana@example.com', 'a long password');
      await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(NOT_SENT);
      expect(screen.getByRole('alert')).not.toHaveTextContent(/code/i);
    });

    it('resend: asked too soon', async () => {
      calls.passwordError = { message: 'Email not confirmed', code: 'email_not_confirmed' };
      calls.resendError = {
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this after 59 seconds.',
      };
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await fillDoor('dana@example.com', 'a long password');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Send it again' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(TOO_MANY);
    });

    it('reset: the email could not be sent', async () => {
      calls.resetError = { code: 'unexpected_failure', message: 'Error sending recovery email' };
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'Send the link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(NOT_SENT);
    });

    it('reset: asked too many times', async () => {
      calls.resetError = { code: 'over_request_rate_limit', message: 'Request rate limit reached' };
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'Send the link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(TOO_MANY);
    });
  });

  it('keeps the resend button waiting for a minute, and lets the address be changed', async () => {
    await openJoin();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('button', { name: /Send it again in \d+s/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com');
  });

  it('offers the link again to somebody who signs in before confirming', async () => {
    calls.passwordError = { message: 'Email not confirmed', code: 'email_not_confirmed' };
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await waitFor(() => {
      expect(calls.order).toContain('resend:signup:dana@example.com');
    });
  });
});

describe('coming back from the confirmation link', () => {
  it('goes on to the invite check, signed in, and then the questions', async () => {
    calls.status = 'signed-up';
    renderJoin('/join?confirmed=1');
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(calls.order).toEqual(['my_invite_status']);
  });

  it('says the address is confirmed when the link opens in a browser that is not signed in', async () => {
    renderJoin('/join?confirmed=1');
    expect(await screen.findByText(/Your email is confirmed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});

describe('the invite link', () => {
  it('claims the invite before asking whether the account is invited', async () => {
    calls.status = 'signed-up';
    renderJoin('/join?invite=tok-123');
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(calls.order).toEqual(['claim_invite', 'my_invite_status']);
    expect(calls.claimedWith).toBe('tok-123');
  });

  it('lets go of the token once it has been answered', async () => {
    calls.status = 'signed-up';
    renderJoin('/join?invite=tok-123');
    await screen.findByText('Before you join');
    expect(window.localStorage.getItem('sciclub.inviteToken')).toBeNull();
  });

  it('keeps it through the sign-up and the email, and claims it after', async () => {
    renderJoin('/join?invite=tok-123');
    expect(window.localStorage.getItem('sciclub.inviteToken')).toBe('tok-123');
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    expect(screen.getByText(/You have an invitation/)).toBeInTheDocument();
    await fillDoor('hidden.relay@privaterelay.example', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your email');
    // Nothing claimed yet: there is no session to claim it with.
    expect(calls.order).not.toContain('claim_invite');

    // The confirmation link brings the account back, and the token with it.
    act(() => {
      calls.setStatus('signed-up');
    });
    await screen.findByText('Before you join');
    expect(calls.claimedWith).toBe('tok-123');
  });

  it('claims for an account whatever address it signed up with', async () => {
    calls.user = { email: 'someone.else@example.com', user_metadata: {} };
    calls.status = 'signed-up';
    renderJoin('/join?invite=tok-123');
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(calls.claimedWith).toBe('tok-123');
  });

  it('still asks the list when the token is refused, since the address may match', async () => {
    calls.claimResult = false;
    calls.status = 'signed-up';
    renderJoin('/join?invite=used');
    await screen.findByText('Before you join');
    expect(calls.order).toEqual(['claim_invite', 'my_invite_status']);
  });

  it('keeps the token and says so when the claim could not be made', async () => {
    calls.claimError = true;
    calls.status = 'signed-up';
    renderJoin('/join?invite=tok-123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your invitation');
    expect(window.localStorage.getItem('sciclub.inviteToken')).toBe('tok-123');
    expect(calls.order).not.toContain('my_invite_status');

    calls.claimError = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
  });

  it('is let go when the person is already a member', async () => {
    window.localStorage.setItem('sciclub.inviteToken', 'old');
    calls.status = 'member';
    renderJoin();
    await screen.findByRole('heading', { name: 'Home' });
    expect(window.localStorage.getItem('sciclub.inviteToken')).toBeNull();
  });
});

describe('the not-invited screen', () => {
  beforeEach(() => {
    calls.invited = false;
    calls.status = 'signed-up';
  });

  it('closes the door and names the address that was refused', async () => {
    renderJoin();
    expect(await screen.findByText(/isn't on the list/i)).toBeInTheDocument();
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
    expect(screen.getByText(/You may have joined with another email/)).toBeInTheDocument();
    expect(screen.queryByText('Before you join')).toBeNull();
  });

  it('names only the organizations that can invite, and the consultation link', async () => {
    renderJoin();
    expect(await screen.findByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me Foundation')).toBeNull();
    expect(screen.getByRole('link', { name: /Book a call with Wojtek/ })).toBeInTheDocument();
  });

  it('does not offer to ask somebody you know', async () => {
    renderJoin();
    await screen.findByText(/isn't on the list/i);
    expect(screen.queryByText(/Ask somebody/i)).toBeNull();
    expect(screen.queryByLabelText(/number of somebody/i)).toBeNull();
  });

  it('signs the account out to try another email', async () => {
    renderJoin();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out and try another email' }),
    );
    expect(calls.order).toContain('signOut');
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });
});

describe('signing in with email', () => {
  async function openSignIn() {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
  }

  it('greets a returning member and lets the wrong door be swapped', async () => {
    await openSignIn();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New here? Join the club' }));
    expect(screen.getByRole('heading', { name: 'Join the club' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Already a member? Sign in' }));
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('lets the browser offer a passkey in the email box', async () => {
    await openSignIn();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username webauthn');
  });

  it('lets a member straight to Home', async () => {
    calls.afterPassword = 'member';
    await openSignIn();
    await fillDoor('sam@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).not.toContain('my_invite_status');
  });

  it('hands the questions to somebody who signed in but never finished joining', async () => {
    await openSignIn();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(calls.order).toEqual(['signInWithPassword:dana@example.com', 'my_invite_status']);
  });

  it('turns away an account that is not invited, before asking for ticks', async () => {
    calls.invited = false;
    await openSignIn();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/isn't on the list/i)).toBeInTheDocument();
    expect(screen.queryByText('Before you join')).toBeNull();
  });

  it('says the same thing for a wrong password and an unknown address', async () => {
    calls.passwordError = { message: 'Invalid login credentials', code: 'invalid_credentials' };
    await openSignIn();
    await fillDoor('dana@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password did not match.',
    );
  });

  it('advances on Enter, and not before both boxes are filled', async () => {
    calls.afterPassword = 'member';
    await openSignIn();
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com{Enter}');
    expect(calls.order).toEqual([]);
    await userEvent.type(screen.getByLabelText('Password'), 'a long password{Enter}');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).toEqual(['signInWithPassword:sam@example.com']);
  });

  it('returns a sign-in to the shared link it came from', async () => {
    calls.afterPassword = 'member';
    renderJoin('/join?next=%2Fchat%2Ft%2Fshared');
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await fillDoor('sam@example.com', 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Shared conversation' })).toBeInTheDocument();
  });
});

describe('forgot password', () => {
  async function openForgot() {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  }

  it('sends the reset link and has it come back to /reset-password', async () => {
    await openForgot();
    expect(screen.getByRole('button', { name: 'Send the link' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Email'), 'Dana@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(calls.order).toEqual(['resetPasswordForEmail:dana@example.com']);
    expect(calls.resetRedirect).toMatch(/\/reset-password$/);
  });

  it('does not say whether the address has an account', async () => {
    await openForgot();
    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }));
    expect(await screen.findByText(/If nobody@example.com has an account/)).toBeInTheDocument();
  });

  it('goes back to sign in', async () => {
    await openForgot();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });
});

describe('Google, Apple and passkeys', () => {
  it('offers Google on both doors', async () => {
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Already a member? Sign in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(calls.order).toEqual(['signInWithOAuth:google']);
  });

  it('joins with Google: an invited Google account goes to the questions', async () => {
    calls.status = 'signed-up';
    calls.user = {
      email: 'dana@gmail.example',
      user_metadata: { full_name: 'Dana Smith' },
    };
    renderJoin('/join?google=signin');
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(calls.order).toEqual(['my_invite_status']);
  });

  it('says what to do when Google comes back without signing anybody in', async () => {
    renderJoin('/join?google=signin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Google did not sign you in.');
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('leaves somebody part-way through joining alone', async () => {
    calls.status = 'signed-up';
    calls.invited = true;
    renderJoin('/join?google=signin');
    await screen.findByText('Before you join');
    expect(calls.order).not.toContain('signOut');
  });

  it('asks Google for its “Sign in as” box on the sign-in door only', async () => {
    calls.widget = 'ready';
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(calls.promptAsked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'New here? Join the club' }));
    expect(calls.promptAsked).toBe(false);
  });

  it('hands Supabase the token with the nonce it was made with', async () => {
    calls.widget = 'ready';
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    calls.onToken?.('id-token', 'raw-nonce');
    await waitFor(() => {
      expect(calls.order).toEqual(['signInWithIdToken:google:id-token:raw-nonce']);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when Google’s account is refused', async () => {
    calls.idTokenError = 'bad token';
    calls.widget = 'ready';
    renderJoin();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    calls.onToken?.('id-token', 'raw-nonce');
    expect(await screen.findByRole('alert')).toHaveTextContent('Google did not sign you in');
  });

  describe('Apple', () => {
    it('is hidden unless VITE_APPLE_SIGN_IN is set', async () => {
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'Join the club' }));
      expect(screen.queryByRole('button', { name: /Apple/ })).toBeNull();
    });

    it('goes to Apple and back to /join?apple=signin when the switch is on', async () => {
      vi.stubEnv('VITE_APPLE_SIGN_IN', '1');
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sign in with Apple' }));
      expect(calls.order).toEqual(['signInWithOAuth:apple']);
    });

    it('says what to do when Apple comes back without signing anybody in', async () => {
      renderJoin('/join?apple=signin');
      expect(await screen.findByRole('alert')).toHaveTextContent('Apple did not sign you in.');
    });
  });

  describe('passkeys', () => {
    it('are hidden unless VITE_PASSKEYS is set', async () => {
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: () => undefined,
        configurable: true,
      });
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
    });

    it('are hidden in a browser without WebAuthn, even when the switch is on', async () => {
      vi.stubEnv('VITE_PASSKEYS', '1');
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
    });

    it('sign in with one tap when both are there', async () => {
      vi.stubEnv('VITE_PASSKEYS', '1');
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: () => undefined,
        configurable: true,
      });
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
      expect(calls.order).toEqual(['signInWithPasskey']);
    });

    it('say nothing when the browser’s own sheet is cancelled', async () => {
      vi.stubEnv('VITE_PASSKEYS', '1');
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: () => undefined,
        configurable: true,
      });
      calls.passkeyError = { name: 'NotAllowedError', message: 'cancelled' };
      renderJoin();
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
      await waitFor(() => {
        expect(calls.order).toEqual(['signInWithPasskey']);
      });
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('the name', () => {
  it('starts as the name Google gave', async () => {
    calls.user = { email: 'dana@gmail.example', user_metadata: { full_name: 'Dana Smith' } };
    await reachName();
    expect(screen.getByPlaceholderText('Alex')).toHaveValue('Dana Smith');
  });

  it('falls back to `name`, which is what some providers send', async () => {
    calls.user = { email: 'dana@example.com', user_metadata: { name: 'Dana' } };
    await reachName();
    expect(screen.getByPlaceholderText('Alex')).toHaveValue('Dana');
  });

  it('starts empty when the provider gave none, as Apple often does', async () => {
    calls.user = { email: 'relay@privaterelay.example', user_metadata: {} };
    await reachName();
    expect(screen.getByPlaceholderText('Alex')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('can be replaced, and the replacement is what is kept', async () => {
    calls.user = { email: 'dana@gmail.example', user_metadata: { full_name: 'Dana Smith' } };
    await reachName();
    await userEvent.clear(screen.getByPlaceholderText('Alex'));
    await userEvent.type(screen.getByPlaceholderText('Alex'), 'Dee');
    expect(screen.getByPlaceholderText('Alex')).toHaveValue('Dee');
  });
});

describe('the username', () => {
  async function reachUsername(name = 'Dana') {
    await reachName();
    await userEvent.clear(screen.getByPlaceholderText('Alex'));
    await userEvent.type(screen.getByPlaceholderText('Alex'), name);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Pick a username');
  }

  it('suggests names built from the name just given', async () => {
    await reachUsername('Dana');
    expect(await screen.findByRole('button', { name: '@dana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '@dana.s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '@dana_s' })).toBeInTheDocument();
    expect(calls.order).toContain('suggest_usernames');
  });

  it('takes a suggestion in one tap, and goes on', async () => {
    await reachUsername();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: '@dana.s' }));
    expect(screen.getByLabelText('Username')).toHaveValue('dana.s');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('lowercases as they type, and drops a leading @', async () => {
    await reachUsername();
    await userEvent.type(screen.getByLabelText('Username'), '@DanaS');
    expect(screen.getByLabelText('Username')).toHaveValue('danas');
  });

  it('says out loud when a name is available, and only then goes on', async () => {
    await reachUsername();
    await userEvent.type(screen.getByLabelText('Username'), 'dana_free');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(await screen.findByText('@dana_free is available.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('@dana_free is available.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(calls.checked).toEqual(['dana_free']);
  });

  it('says when a name is taken, and does not go on', async () => {
    calls.taken = ['dana_taken'];
    await reachUsername();
    await userEvent.type(screen.getByLabelText('Username'), 'dana_taken');
    expect(await screen.findByText('@dana_taken is taken. Try another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('does not ask the database about a name that cannot be one', async () => {
    await reachUsername();
    await userEvent.type(screen.getByLabelText('Username'), 'ab');
    expect(screen.getByRole('status')).toHaveTextContent(/3 to 20 letters/);
    await userEvent.type(screen.getByLabelText('Username'), '..');
    expect(screen.getByRole('status')).toHaveTextContent(/3 to 20 letters/);
    expect(calls.checked).toEqual([]);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('asks again after an edit rather than trusting the last answer', async () => {
    await reachUsername();
    await userEvent.type(screen.getByLabelText('Username'), 'dana_ok');
    await screen.findByText('@dana_ok is available.');
    calls.taken = ['dana_ok2'];
    await userEvent.type(screen.getByLabelText('Username'), '2');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(await screen.findByText('@dana_ok2 is taken. Try another.')).toBeInTheDocument();
  });

  it('sends the username to the insert', async () => {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
    await waitFor(() => {
      expect(calls.submitted?.username).toBe('dana');
    });
  });

  it('goes back to the username when it was taken in the meantime', async () => {
    calls.submitResults = [
      { ok: false, usernameRefused: true, error: 'That username was just taken. Choose another.' },
    ];
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
    expect(await screen.findByText('Pick a username')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('just taken');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('the phone for events', () => {
  async function reachPhone() {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await screen.findByText('A number for events?');
  }

  it('is optional: Continue works with nothing typed', async () => {
    await reachPhone();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Add a photo?')).toBeInTheDocument();
  });

  it('can be skipped, and sends no number', async () => {
    await reachPhone();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '408');
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await waitFor(() => {
      expect(calls.submitted).not.toBeNull();
    });
    expect(calls.submitted?.phone).toBe('');
  });

  it('says who gets the number', async () => {
    await reachPhone();
    expect(screen.getByText(/Event hosts get your email, and this number/)).toBeInTheDocument();
  });

  it('will not go on with half a number', async () => {
    await reachPhone();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '408555');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '0112');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('carries a whole number to the insert, formatted as typed', async () => {
    await reachPhone();
    await userEvent.type(screen.getByPlaceholderText('(408) 555-0112'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await waitFor(() => {
      expect(calls.submitted?.phone).toBe('(408) 555-0112');
    });
  });
});

describe('agreeing to the terms', () => {
  it('asks for one box, after the club has said yes, and no text-message consent', async () => {
    calls.status = 'signed-up';
    renderJoin();
    expect(await screen.findByText('Before you join')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/Text me/)).toBeNull();
    expect(screen.getByRole('link', { name: /Terms of Service/ })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('goes no further without the tick', async () => {
    calls.status = 'signed-up';
    renderJoin();
    await screen.findByText('Before you join');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByPlaceholderText('Alex')).toBeNull();
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('is not asked of somebody turned away', async () => {
    calls.status = 'signed-up';
    calls.invited = false;
    renderJoin();
    await screen.findByText(/isn't on the list/i);
    expect(screen.queryByText('Before you join')).toBeNull();
  });
});

describe('somebody already in the club', () => {
  it('is sent on to Home', async () => {
    calls.status = 'member';
    renderJoin();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('resumes the destination when Google returns an existing member', async () => {
    calls.status = 'member';
    renderJoin('/join?google=signin&next=%2Fchat%2Ft%2Fshared');
    expect(await screen.findByRole('heading', { name: 'Shared conversation' })).toBeInTheDocument();
  });

  it('keeps suspended members at the shell rather than looping through a profile link', async () => {
    calls.status = 'suspended';
    renderJoin('/join?next=%2Fprofile%2Fdetails');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('the passkey offer after joining', () => {
  async function finishLater() {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
  }

  it('is made when the switch is on and the browser can', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: () => undefined,
      configurable: true,
    });
    await finishLater();
    expect(await screen.findByText('Sign in faster next time?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up a passkey' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).toContain('registerPasskey');
  });

  it('can be put off', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: () => undefined,
      configurable: true,
    });
    await finishLater();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).not.toContain('registerPasskey');
  });

  it('is not made while the switch is off', async () => {
    await finishLater();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Sign in faster next time?')).toBeNull();
  });
});

describe('the keyboard', () => {
  it('advances a question on Enter, not only on the button', async () => {
    await reachName();
    await userEvent.type(screen.getByPlaceholderText('Alex'), 'Dana{Enter}');
    expect(await screen.findByText('Pick a username')).toBeInTheDocument();
  });

  it('does nothing on Enter when the step is not finished', async () => {
    await reachName();
    await userEvent.type(screen.getByPlaceholderText('Alex'), '{Enter}');
    expect(screen.queryByText('Pick a username')).toBeNull();
  });
});
describe('the club is adults only', () => {
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  it('says up front that the club is 18+', async () => {
    await reachBirthday('Sam');
    expect(screen.getByText(/The club is 18\+/)).toBeInTheDocument();
  });

  it('explains rather than just disabling, when the date is under 18', async () => {
    await reachBirthday('Sam');
    await typeBirthday(yearsAgo(15));
    expect(await screen.findByText(/The SCI Club is for adults/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('lets an adult through, and shows the age it will publish', async () => {
    await reachBirthday('Sam');
    await typeBirthday(yearsAgo(30));
    expect(await screen.findByText(/never your birthday/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});

// Typed boxes, not a calendar: many members use voice control, a mouth stick
// or a head pointer, and a calendar's small cells and long paging are hardest
// of all for them. See lib/date-parts.ts.

describe('the birthday boxes', () => {
  it('reads the date back in words, the month typed as its name', async () => {
    await reachBirthday('Sam');
    await userEvent.type(screen.getByLabelText('Month'), 'may');
    await userEvent.type(screen.getByLabelText('Day'), '27');
    await userEvent.type(screen.getByLabelText('Year'), '1996');
    expect(await screen.findByText('May 27, 1996')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  // Dictation and a paste both arrive as one insertion, not key by key.
  it('spreads a whole date said into one box across all three', async () => {
    await reachBirthday('Sam');
    await userEvent.click(screen.getByLabelText('Month'));
    await userEvent.paste('5/27/1996');
    expect(screen.getByLabelText('Month')).toHaveValue('5');
    expect(screen.getByLabelText('Day')).toHaveValue('27');
    expect(screen.getByLabelText('Year')).toHaveValue('1996');
  });

  it('says why a date that does not exist goes no further', async () => {
    await reachBirthday('Sam');
    await enterBirthday('1996-04-31');
    expect(await screen.findByRole('alert')).toHaveTextContent('April 1996 has 30 days.');
    expect(screen.getByLabelText('Day')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  // At the owner's word: a box filled is a tap saved.
  it('moves on by itself as each box fills, and stops at the last', async () => {
    await reachBirthday('Sam');
    await userEvent.click(screen.getByLabelText('Month'));
    await userEvent.keyboard('05');
    expect(screen.getByLabelText('Day')).toHaveFocus();
    await userEvent.keyboard('27');
    expect(screen.getByLabelText('Year')).toHaveFocus();
    await userEvent.keyboard('1996');
    expect(screen.getByLabelText('Year')).toHaveFocus();
    expect(await screen.findByText('May 27, 1996')).toBeInTheDocument();
  });

  it('waits after a 1, which may be heading for 12', async () => {
    await reachBirthday('Sam');
    await userEvent.type(screen.getByLabelText('Month'), '1');
    expect(screen.getByLabelText('Month')).toHaveFocus();
    await userEvent.keyboard('2');
    expect(screen.getByLabelText('Day')).toHaveFocus();
  });

  it('moves on from a single digit nothing could follow', async () => {
    await reachBirthday('Sam');
    await userEvent.type(screen.getByLabelText('Month'), '5');
    expect(screen.getByLabelText('Day')).toHaveFocus();
  });

  // The problem is said beside the cursor, not one box behind it.
  it('stays on a box that is wrong', async () => {
    await reachBirthday('Sam');
    await userEvent.type(screen.getByLabelText('Month'), '13');
    expect(screen.getByLabelText('Month')).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(/1 to 12/);
  });

  it('goes back a box on Backspace in an empty one, so a slip can be fixed', async () => {
    await reachBirthday('Sam');
    await userEvent.type(screen.getByLabelText('Month'), '05');
    expect(screen.getByLabelText('Day')).toHaveFocus();
    await userEvent.keyboard('{Backspace}');
    expect(screen.getByLabelText('Month')).toHaveFocus();
    await userEvent.keyboard('{Backspace}6');
    expect(screen.getByLabelText('Month')).toHaveValue('06');
  });

  it('lets a saved birthday be filled in for them', async () => {
    await reachBirthday('Sam');
    expect(screen.getByLabelText('Month')).toHaveAttribute('autocomplete', 'bday-month');
    expect(screen.getByLabelText('Day')).toHaveAttribute('autocomplete', 'bday-day');
    expect(screen.getByLabelText('Year')).toHaveAttribute('autocomplete', 'bday-year');
  });

  it('names the three boxes together as the birthday', async () => {
    await reachBirthday('Sam');
    expect(screen.getByRole('group', { name: 'Your birthday' })).toBeInTheDocument();
  });
});

describe('finishing later', () => {
  async function reachInjury() {
    calls.invited = true;
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  // The club is 18+ and a row needs a name, so those two stay required. Past
  // them the schema allows every answer to be absent, and Me is where they
  // get filled in.
  it('is not offered before the birthday is answered', async () => {
    calls.invited = true;
    await reachName();
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
  });

  async function reachBirthdayStep() {
    calls.invited = true;
    await reachBirthday('Dana');
    await screen.findByText('When is your birthday?');
  }

  // Name and age are the two a row cannot be written without, so the way out
  // appears the moment both are in rather than one Continue later.
  it('appears on the birthday step itself, once the date is a real one', async () => {
    await reachBirthdayStep();
    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();

    await enterBirthday('1990-04-02');

    expect(await screen.findByRole('button', { name: /Finish later/ })).toBeInTheDocument();
  });

  // Skipping with an empty or under-age date would write a row the database
  // refuses, and the refusal would arrive as a sentence about a trigger.
  it('stays hidden for a birthday the club cannot accept', async () => {
    await reachBirthdayStep();
    await enterBirthday('2020-01-01');

    expect(screen.queryByRole('button', { name: /Finish later/ })).toBeNull();
  });

  it('enters the club straight from the birthday', async () => {
    await reachBirthdayStep();
    await enterBirthday('1990-04-02');
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));

    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Dana');
    });
  });

  it('is offered from the step after the birthday', async () => {
    await reachInjury();
    expect(await screen.findByRole('button', { name: /Finish later/ })).toBeInTheDocument();
  });

  it('enters the club with what was answered so far', async () => {
    await reachInjury();
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
    await waitFor(() => {
      expect(calls.submitted?.displayName).toBe('Dana');
    });
    // Unanswered, and left that way rather than guessed at.
    expect(calls.submitted?.exactLevel).toBeNull();
    expect(calls.submitted?.state).toBe('');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('a photograph the club cannot hold', () => {
  const REFUSED = {
    ok: false,
    photoRefused: true,
    error: "That kind of file can't be used. Try a JPEG or PNG.",
  };

  beforeEach(() => {
    // jsdom has no object URLs; the step makes one for the preview.
    URL.createObjectURL = () => 'blob:preview';
  });

  async function reachPhoto() {
    calls.invited = true;
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.selectOptions(await screen.findByLabelText('State'), 'CA');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // The phone for events is optional, and left empty.
    await screen.findByText('A number for events?');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Add a photo?');
  }

  async function choose(name = 'photo.heic') {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no photograph input');
    await userEvent.upload(input, new File(['x'], name, { type: 'image/png' }));
  }

  it('names the photo control, and renames it once there is a photo', async () => {
    await reachPhoto();
    expect(screen.getByLabelText('Choose a photo')).toHaveAttribute('type', 'file');
    await choose();
    expect(screen.getByLabelText('Change the photo')).toHaveAttribute('type', 'file');
  });

  // The owner, 2026-09-30: stay on the photo step with the sentence.
  it('stays on the photo step and says why, without a preview of what was refused', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED.error);
    expect(screen.getByText('Add a photo?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull();
    expect(document.querySelector('label img')).toBeNull();
  });

  it('still lets them in with Skip for now, without the photograph', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.submitted?.photoFile).toBeNull();
  });

  // Skip used to `set` the file away and submit from the same render, which
  // still held it: the photograph it skipped went up anyway.
  it('skips a photograph that is chosen and never sent', async () => {
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => {
      expect(calls.submitted).not.toBeNull();
    });
    expect(calls.submitted?.photoFile).toBeNull();
  });

  it('takes the sentence away when another photograph is chosen', async () => {
    calls.submitResults = [REFUSED];
    await reachPhoto();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Enter the club' }));
    await screen.findByRole('alert');
    await choose('another.png');

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// The owner, 2026-10-01: nothing that has already been answered should need a
// second press to move on.
describe('steps that move on by themselves', () => {
  async function reachInjuryStep() {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  it('moves on from the injury step when they would rather not say', async () => {
    await reachInjuryStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    expect(await screen.findByText('Where do you live?')).toBeInTheDocument();
  });

  it('offers rather not say for where they live, and moves on to the phone', async () => {
    await reachInjuryStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Rather not say' }));
    await screen.findByText('Where do you live?');
    await userEvent.click(screen.getByRole('button', { name: 'Rather not say' }));

    expect(await screen.findByText('A number for events?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Add a photo?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => {
      expect(calls.submitted?.declined).toEqual(['exactLevel', 'injuryDate', 'city', 'state']);
    });
    expect(calls.submitted?.state).toBe('');
  });
});

// Month, day, year like the birthday, but the year alone is a whole answer.
describe('the injury date boxes', () => {
  async function reachInjuryStep() {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Tell us about your injury');
    // Without moving the cursor, which the step put in Month.
    fireEvent.change(screen.getByLabelText('Level of injury'), { target: { value: 'C5' } });
  }

  it('runs month, day, year, starting in Month, as the birthday does', async () => {
    await reachInjuryStep();
    const boxes = ['Month', 'Day', 'Year'].map((name) => screen.getByLabelText(name));
    expect(boxes[0]).toHaveFocus();
    expect(boxes[0]?.compareDocumentPosition(boxes[1] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(boxes[1]?.compareDocumentPosition(boxes[2] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await userEvent.keyboard('06');
    expect(screen.getByLabelText('Day')).toHaveFocus();
    await userEvent.keyboard('14');
    expect(screen.getByLabelText('Year')).toHaveFocus();
    await userEvent.keyboard('2013');
    expect(await screen.findByText('June 14, 2013')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('goes on with the year alone', async () => {
    await reachInjuryStep();
    await userEvent.type(screen.getByLabelText('Year'), '2013');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Where do you live?')).toBeInTheDocument();
  });

  // The cursor starts in Month, and somebody who only knows the year types it there.
  it('moves a year typed into Month across to Year, with no error on the way', async () => {
    await reachInjuryStep();
    await userEvent.keyboard('20');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.keyboard('13');
    expect(screen.getByLabelText('Month')).toHaveValue('');
    expect(screen.getByLabelText('Year')).toHaveValue('2013');
    expect(screen.getByLabelText('Year')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('moves a year from the 1900s across too', async () => {
    await reachInjuryStep();
    await userEvent.keyboard('1998');
    expect(screen.getByLabelText('Year')).toHaveValue('1998');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('still takes February, once the Day box is reached', async () => {
    await reachInjuryStep();
    await userEvent.keyboard('2');
    expect(screen.getByLabelText('Month')).toHaveFocus();
    await userEvent.click(screen.getByLabelText('Day'));
    await userEvent.keyboard('14');
    await userEvent.keyboard('2013');
    expect(await screen.findByText('February 14, 2013')).toBeInTheDocument();
  });
});

describe('notifications, as they enter', () => {
  async function finishLater() {
    await reachBirthday('Dana');
    await enterBirthday('1990-04-02');
    await userEvent.click(await screen.findByRole('button', { name: /Finish later/ }));
  }

  it('asks somebody who pressed Finish later, and Not now goes to Home', async () => {
    calls.vapidKey = 'key';
    await finishLater();
    expect(await screen.findByText('Turn on notifications?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(calls.order).not.toContain('turnOn');
    // So the installed app does not ask this phone again (AskOnOpening).
    expect(calls.order).toContain('asked');
  });

  it('asks the device when they say yes', async () => {
    calls.vapidKey = 'key';
    await finishLater();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(calls.order).toContain('turnOn');
  });

  it('says how on an iPhone that has not added the club to its Home Screen', async () => {
    calls.vapidKey = 'key';
    calls.notificationState = 'install';
    await finishLater();
    expect(await screen.findByText('Get notifications on your iPhone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    // Nothing was asked, only how to install: the installed app still asks.
    expect(calls.order).not.toContain('asked');
  });

  it('does not ask a device that has already answered', async () => {
    calls.vapidKey = 'key';
    calls.notificationState = 'refused';
    await finishLater();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Turn on notifications?')).toBeNull();
  });

  it('does not ask while the club cannot send', async () => {
    await finishLater();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Turn on notifications?')).toBeNull();
  });
});

// iOS opens the number pad only for a focus inside a tap. The tap on Continue
// focuses a hidden numeric field before the code is asked for, and the code
// field takes focus over from it, which keeps the pad open (the owner,
