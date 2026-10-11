import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AccountEmail from '@/lib/account-email';
import type { SignInDetails, SignInState } from '@/lib/account-email';
import { AnnounceProvider } from '@/lib/announce';
import type * as AppleSignIn from '@/lib/apple-sign-in';
import type * as AuthEmail from '@/lib/auth-email';
import type * as Usernames from '@/lib/usernames';

interface TestState {
  calls: string[];
  fail: string | null;
  phone: string | null;
  free: boolean | null;
  usernameError: string | null;
  apple: boolean;
  passkeys: boolean;
  passkeyList: { id: string; name: string; createdAt: string }[];
  passkeyCancelled: boolean;
}
const state = vi.hoisted(
  (): TestState => ({
    calls: [],
    fail: null,
    phone: null,
    free: true,
    usernameError: null,
    apple: false,
    passkeys: false,
    passkeyList: [],
    passkeyCancelled: false,
  }),
);

vi.mock('@/lib/account-email', async (importOriginal) => ({
  ...(await importOriginal<typeof AccountEmail>()),
  changeEmail: (email: string) => {
    state.calls.push(`change:${email}`);
    return Promise.resolve(state.fail ? { ok: false, error: state.fail } : { ok: true });
  },
  resendEmailChange: (email: string) => {
    state.calls.push(`resend:${email}`);
    return Promise.resolve({ ok: true });
  },
}));

vi.mock('@/lib/auth-email', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthEmail>()),
  sendPasswordReset: (email: string) => {
    state.calls.push(`reset:${email}`);
    return Promise.resolve({ ok: true });
  },
}));

// The Google card has its own test; here it is only a marker for what Me passes it.
vi.mock('@/routes/me/google-sign-in', () => ({
  GoogleSignIn: ({ canUnlink }: { canUnlink: boolean }) => (
    <p>Google card, can unlink: {String(canUnlink)}</p>
  ),
}));

vi.mock('@/lib/apple-sign-in', async (importOriginal) => ({
  ...(await importOriginal<typeof AppleSignIn>()),
  appleSignInEnabled: () => state.apple,
  linkApple: () => {
    state.calls.push('apple:link');
    return Promise.resolve({ ok: true });
  },
  unlinkApple: () => {
    state.calls.push('apple:unlink');
    return Promise.resolve({ ok: true });
  },
}));

vi.mock('@/lib/passkeys', () => ({
  passkeysAvailable: () => state.passkeys,
  listPasskeys: () => Promise.resolve({ ok: true, passkeys: state.passkeyList }),
  registerPasskey: () => {
    state.calls.push('passkey:add');
    return Promise.resolve(state.passkeyCancelled ? { ok: false, error: '' } : { ok: true });
  },
  deletePasskey: (id: string) => {
    state.calls.push(`passkey:remove:${id}`);
    return Promise.resolve({ ok: true });
  },
}));

// event-phone's hook calls its own functions, so the table is what is faked.
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { phone: state.phone }, error: null }),
        }),
      }),
      update: (values: { phone: string | null }) => ({
        eq: () => {
          state.calls.push(`phone:${values.phone}`);
          state.phone = values.phone;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/usernames', async (importOriginal) => ({
  ...(await importOriginal<typeof Usernames>()),
  usernameAvailable: (name: string) => {
    state.calls.push(`available:${name}`);
    return Promise.resolve(state.free);
  },
  setMyUsername: (name: string) => {
    state.calls.push(`username:${name}`);
    return Promise.resolve(
      state.usernameError ? { ok: false, error: state.usernameError } : { ok: true },
    );
  },
}));

const { SignInSection } = await import('@/routes/me/sign-in-section');

const NOW = '2026-02-01T00:00:00Z';
const identity = { identity_id: 'i1', id: 'x', user_id: 'u1', created_at: NOW } as never;

function ready(overrides: Partial<SignInDetails> = {}): SignInState {
  return {
    status: 'ready',
    details: {
      email: 'dana@example.com',
      pendingEmail: null,
      googleAddress: null,
      providers: { google: null, apple: null, email: true },
      ...overrides,
    },
  };
}

const reload = vi.fn();
const usernameChanged = vi.fn();

function renderSection(signIn: SignInState = ready(), username: string | null = 'dana.s') {
  return render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={['/me']}>
        <SignInSection
          userId="u1"
          state={signIn}
          reload={reload}
          username={username}
          onUsernameChanged={usernameChanged}
        />
      </MemoryRouter>
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  state.calls = [];
  state.fail = null;
  state.phone = null;
  state.free = true;
  state.usernameError = null;
  state.apple = false;
  state.passkeys = false;
  state.passkeyList = [];
  state.passkeyCancelled = false;
  reload.mockClear();
  usernameChanged.mockClear();
});

describe('Email', () => {
  it('shows the address they sign in with', () => {
    renderSection();
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
  });

  // Read only (the owner, 2026-10-11): the address is how they were invited.
  it('offers no way to change it, and says who can', () => {
    renderSection(ready({ pendingEmail: 'new@example.com' }));
    expect(screen.queryByRole('button', { name: 'Change email' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New email')).not.toBeInTheDocument();
    expect(screen.queryByText(/new@example.com/)).not.toBeInTheDocument();
    expect(screen.getByText(/can't be changed here/)).toBeInTheDocument();
    expect(screen.getByText(/ask an administrator/)).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });

  it('points a phone account at the banner rather than offering Change', () => {
    renderSection(ready({ email: null }));
    expect(screen.getByText(/no email yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change email' })).not.toBeInTheDocument();
  });
});

describe('Password', () => {
  it('emails a link to the current address and never asks for the old password', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(state.calls).toEqual(['reset:dana@example.com']);
    expect(await screen.findByText('Check your email for the link.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('is not shown to an account with no confirmed email', () => {
    renderSection(ready({ email: null }));
    expect(screen.queryByRole('button', { name: 'Email me a link' })).not.toBeInTheDocument();
  });
});

describe('keeping one way in', () => {
  it('lets Google go while a confirmed email remains', () => {
    renderSection(ready({ providers: { google: identity, apple: null, email: true } }));
    expect(screen.getByText('Google card, can unlink: true')).toBeInTheDocument();
  });

  it('keeps Google when it is the only way in', () => {
    renderSection(
      ready({ email: null, providers: { google: identity, apple: null, email: false } }),
    );
    expect(screen.getByText('Google card, can unlink: false')).toBeInTheDocument();
  });

  it('keeps Apple when it is the only way in', () => {
    state.apple = true;
    renderSection(
      ready({ email: null, providers: { google: null, apple: identity, email: false } }),
    );
    expect(screen.queryByRole('button', { name: 'Unlink Apple' })).not.toBeInTheDocument();
    expect(screen.getByText(/only way in/)).toBeInTheDocument();
  });

  it('unlinks Apple while another way in remains', async () => {
    state.apple = true;
    renderSection(ready({ providers: { google: null, apple: identity, email: true } }));
    await userEvent.click(screen.getByRole('button', { name: 'Unlink Apple' }));
    expect(state.calls).toEqual(['apple:unlink']);
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });
});

describe('Apple and passkeys sit behind their switches', () => {
  it('shows neither when both are off', () => {
    renderSection();
    expect(screen.queryByRole('heading', { name: 'Apple' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Passkeys' })).not.toBeInTheDocument();
  });

  it('shows Apple when its switch is on', async () => {
    state.apple = true;
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Link Apple' }));
    expect(state.calls).toEqual(['apple:link']);
  });

  it('lists, adds and removes passkeys when they are on', async () => {
    state.passkeys = true;
    state.passkeyList = [{ id: 'k1', name: 'iPhone', createdAt: NOW }];
    renderSection();
    expect(await screen.findByText('iPhone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove passkey iPhone' }));
    expect(state.calls).toEqual(['passkey:add', 'passkey:remove:k1']);
  });

  it('says nothing when the browser’s own sheet is cancelled', async () => {
    state.passkeys = true;
    state.passkeyCancelled = true;
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Phone number for events', () => {
  it('says it is not a way to sign in, and who gets it', () => {
    renderSection();
    expect(screen.getByText(/not a way to sign in/)).toBeInTheDocument();
  });

  it('saves a number as typed, and shows it back', async () => {
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a number' }));
    await userEvent.type(screen.getByLabelText('Phone number'), '4085550112');
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }));
    expect(state.calls).toEqual(['phone:14085550112']);
    expect(await screen.findByText('(408) 555-0112')).toBeInTheDocument();
  });

  it('clears it', async () => {
    state.phone = '14085550112';
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove number' }));
    expect(state.calls).toEqual(['phone:null']);
    expect(await screen.findByText('No number added.')).toBeInTheDocument();
  });

  it('will not save part of a number', async () => {
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a number' }));
    await userEvent.type(screen.getByLabelText('Phone number'), '408555');
    expect(screen.getByRole('button', { name: 'Save number' })).toBeDisabled();
  });
});

describe('Username', () => {
  async function startEditing() {
    await userEvent.click(screen.getByRole('button', { name: 'Change username' }));
    const field = screen.getByLabelText('New username');
    await userEvent.clear(field);
    return field;
  }

  it('shows the current one', () => {
    renderSection();
    expect(screen.getByText('@dana.s')).toBeInTheDocument();
  });

  it('lowercases as they type, and says when the name is free', async () => {
    renderSection();
    const field = await startEditing();
    await userEvent.type(field, '@Dana.Swim');
    expect(field).toHaveValue('dana.swim');
    expect(await screen.findByText('@dana.swim is available.')).toBeInTheDocument();
  });

  it('saves a free name and tells Me, so the hero changes at once', async () => {
    renderSection();
    const field = await startEditing();
    await userEvent.type(field, 'dana.swim');
    await screen.findByText('@dana.swim is available.');
    await userEvent.click(screen.getByRole('button', { name: 'Save username' }));
    expect(state.calls).toContain('username:dana.swim');
    expect(usernameChanged).toHaveBeenCalledWith('dana.swim');
  });

  it('will not save a taken name', async () => {
    state.free = false;
    renderSection();
    const field = await startEditing();
    await userEvent.type(field, 'alfred');
    expect(await screen.findByText('@alfred is taken.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save username' })).toBeDisabled();
  });

  it('does not even ask the database about a name that cannot be valid', async () => {
    renderSection();
    const field = await startEditing();
    await userEvent.type(field, 'ab');
    expect(screen.getByText(/3 to 20 lowercase/)).toBeInTheDocument();
    expect(state.calls.filter((c) => c.startsWith('available'))).toEqual([]);
  });

  it('shows the database’s refusal when somebody took it a moment ago', async () => {
    state.usernameError = 'That username is taken.';
    renderSection();
    const field = await startEditing();
    await userEvent.type(field, 'dana.swim');
    await screen.findByText('@dana.swim is available.');
    await userEvent.click(screen.getByRole('button', { name: 'Save username' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken.');
    expect(usernameChanged).not.toHaveBeenCalled();
  });
});
