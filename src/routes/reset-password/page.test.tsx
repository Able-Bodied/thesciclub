import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: true,
  updated: [] as unknown[],
  error: null as { message: string; code?: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session ? {} : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
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
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.session = true;
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

  it('says the link has expired when it signed nobody in', async () => {
    auth.session = false;
    renderPage();
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Join' })).toBeInTheDocument();
    expect(auth.updated).toEqual([]);
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
