import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: true,
  /** Whether this visit's reset link worked (lib/recovery-link). */
  linkWorked: true,
  forgotten: 0,
  /** The page's own subscriber, to send PASSWORD_RECOVERY to after it mounts. */
  listener: null as ((event: string, session: unknown) => void) | null,
  updated: [] as unknown[],
  error: null as { message: string; code?: string } | null,
}));

vi.mock('@/lib/recovery-link', () => ({
  recoveryLinkWorked: () => auth.linkWorked,
  forgetRecoveryLink: () => {
    auth.forgotten += 1;
  },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session ? {} : null } }),
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      updateUser: (attributes: unknown) => {
        auth.updated.push(attributes);
        return Promise.resolve({ error: auth.error });
      },
    },
  }),
}));

const { default: ResetPasswordPage } = await import('@/routes/reset-password/page');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/home" element={<h1>Home</h1>} />
        <Route path="/join" element={<h1>Join</h1>} />
        <Route path="/me" element={<h1>Me</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.session = true;
  auth.linkWorked = true;
  auth.forgotten = 0;
  auth.listener = null;
  auth.updated = [];
  auth.error = null;
});

describe('choosing a new password', () => {
  it('sets it, once the same eight characters are typed twice, and goes Home', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: 'Save password' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('New password'), 'a new password');
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type it again'), 'a new password');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(auth.updated).toEqual([{ password: 'a new password' }]);
    // The link has done its one job: back here, it no longer opens the form.
    expect(auth.forgotten).toBe(1);
  });

  it('says when the two do not match, and does not save', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('New password'), 'a new password');
    await userEvent.type(screen.getByLabelText('Type it again'), 'another one');
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();
  });

  it('wants at least eight characters', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('New password'), 'seven77');
    await userEvent.type(screen.getByLabelText('Type it again'), 'seven77');
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();
  });

  it('says why when Supabase refuses', async () => {
    auth.error = { message: 'New password should be different from the old password.' };
    renderPage();
    await userEvent.type(await screen.findByLabelText('New password'), 'a new password');
    await userEvent.type(screen.getByLabelText('Type it again'), 'a new password');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull();
  });

  it('says the link no longer works when it signed nobody in', async () => {
    auth.session = false;
    auth.linkWorked = false;
    renderPage();
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument();
    expect(screen.getByText(/works once, within an hour/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Join' })).toBeInTheDocument();
    expect(auth.updated).toEqual([]);
  });

  // The owner, 2026-10-14: a days-old, already-used link, opened while signed
  // in, offered a new password. Supabase refused the link; the session stayed.
  it('offers no form to somebody signed in whose link did not work', async () => {
    auth.linkWorked = false;
    renderPage();
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Go to Account' }));
    expect(await screen.findByRole('heading', { name: 'Me' })).toBeInTheDocument();
    expect(auth.updated).toEqual([]);
  });

  it('opens the form when the link is read after the page is up', async () => {
    auth.linkWorked = false;
    renderPage();
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument();
    act(() => {
      auth.listener?.('PASSWORD_RECOVERY', {});
    });
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it('is not opened by any other sign-in', async () => {
    auth.linkWorked = false;
    renderPage();
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument();
    act(() => {
      auth.listener?.('SIGNED_IN', {});
      auth.listener?.('TOKEN_REFRESHED', {});
    });
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('says a used or expired link has expired, not that a code is wrong', async () => {
    auth.error = { code: 'otp_expired', message: 'Email link is invalid or has expired' };
    renderPage();
    await userEvent.type(await screen.findByLabelText('New password'), 'a new password');
    await userEvent.type(screen.getByLabelText('Type it again'), 'a new password');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That link has expired or was already used. Ask for a new one.',
    );
  });
});
