import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AccountEmail from '@/lib/account-email';
import type { SignInDetails, SignInState } from '@/lib/account-email';
import { AnnounceProvider } from '@/lib/announce';

const calls = vi.hoisted(() => ({ list: [] as string[], fail: null as string | null }));

vi.mock('@/lib/account-email', async (importOriginal) => ({
  ...(await importOriginal<typeof AccountEmail>()),
  changeEmail: (email: string) => {
    calls.list.push(`change:${email}`);
    return Promise.resolve(calls.fail ? { ok: false, error: calls.fail } : { ok: true });
  },
  addEmailAndPassword: (email: string, password: string) => {
    calls.list.push(`add:${email}:${password}`);
    return Promise.resolve(calls.fail ? { ok: false, error: calls.fail } : { ok: true });
  },
  resendEmailChange: (email: string) => {
    calls.list.push(`resend:${email}`);
    return Promise.resolve({ ok: true });
  },
}));

const { AddEmailBanner } = await import('@/routes/me/add-email-banner');

function details(overrides: Partial<SignInDetails> = {}): SignInState {
  return {
    status: 'ready',
    details: {
      email: null,
      pendingEmail: null,
      googleAddress: null,
      providers: { google: null, apple: null, email: false },
      ...overrides,
    },
  };
}

const reload = vi.fn();

function renderBanner(state: SignInState) {
  return render(
    <AnnounceProvider>
      <AddEmailBanner state={state} reload={reload} />
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  calls.list = [];
  calls.fail = null;
  reload.mockClear();
});

describe('the add-an-email banner', () => {
  it('asks a phone account for an email and a password', async () => {
    renderBanner(details());
    expect(
      screen.getByRole('heading', { name: 'Add an email so you can keep signing in' }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'Dana@Example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
    // The address is cleaned by the client function, not by the form.
    expect(calls.list).toEqual(['add:Dana@Example.com:a long password']);
    expect(reload).toHaveBeenCalled();
  });

  it('will not send a password shorter than eight characters', async () => {
    renderBanner(details());
    await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    expect(screen.getByRole('button', { name: 'Add email' })).toBeDisabled();
  });

  it('draws nothing for an account that has a confirmed email', () => {
    renderBanner(details({ email: 'dana@example.com' }));
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('draws nothing while the account is being read', () => {
    renderBanner({ status: 'loading' });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  describe('Use my Google address', () => {
    it('is one tap that sets the address Google gave', async () => {
      renderBanner(details({ googleAddress: 'dana@gmail.com' }));
      await userEvent.click(
        screen.getByRole('button', { name: 'Use my Google address (dana@gmail.com)' }),
      );
      expect(calls.list).toEqual(['change:dana@gmail.com']);
      expect(reload).toHaveBeenCalled();
    });

    it('is not offered when Google is not linked', () => {
      renderBanner(details({ googleAddress: null }));
      expect(
        screen.queryByRole('button', { name: /Use my Google address/ }),
      ).not.toBeInTheDocument();
    });

    it('leaves the email and password form below it', () => {
      renderBanner(details({ googleAddress: 'dana@gmail.com' }));
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('says why when the address was refused, and does not reload', async () => {
      calls.fail = 'That address is already in use.';
      renderBanner(details({ googleAddress: 'dana@gmail.com' }));
      await userEvent.click(
        screen.getByRole('button', { name: 'Use my Google address (dana@gmail.com)' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('already in use');
      expect(reload).not.toHaveBeenCalled();
    });
  });

  it('stays, with the link offered again, until the address is confirmed', async () => {
    renderBanner(details({ pendingEmail: 'dana@gmail.com' }));
    expect(screen.getByText(/We sent a link to dana@gmail.com/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    expect(calls.list).toEqual(['resend:dana@gmail.com']);
  });

  it('lets somebody who mistyped start again with a different address', async () => {
    renderBanner(details({ pendingEmail: 'dna@gmail.com' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
