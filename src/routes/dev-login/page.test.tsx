import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signedInWith: [] as { email?: string; phone?: string; password: string }[],
  error: null as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: (credentials: { email?: string; phone?: string; password: string }) => {
        auth.signedInWith.push(credentials);
        return Promise.resolve({ error: auth.error ? { message: auth.error } : null });
      },
    },
  }),
}));

const { default: DevLoginPage } = await import('@/routes/dev-login/page');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dev-login" element={<DevLoginPage />} />
        <Route path="/home" element={<h1>Home</h1>} />
        <Route path="/events" element={<h1>Events</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.signedInWith = [];
  auth.error = null;
});

describe('DevLoginPage', () => {
  it('lands where the app opens when no next is given', async () => {
    renderAt('/dev-login?email=alfred@local.test');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('goes to next when one is given', async () => {
    renderAt('/dev-login?email=alfred@local.test&next=/events');
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  it('signs in the seeded account with the seeded password unless told another', async () => {
    renderAt('/dev-login?email=maya@local.test');
    await screen.findByRole('heading', { name: 'Home' });
    expect(auth.signedInWith).toEqual([
      { email: 'maya@local.test', password: 'local-dev-password' },
    ]);
  });

  it('uses the password it is given', async () => {
    renderAt('/dev-login?email=sam@local.test&password=other-password');
    await screen.findByRole('heading', { name: 'Home' });
    expect(auth.signedInWith[0]?.password).toBe('other-password');
  });

  // A phone-only member, as the live club has: the same password call, with
  // a phone in place of an address.
  it('signs in a phone-only member by phone with the seeded password', async () => {
    renderAt('/dev-login?phone=14155550199');
    await screen.findByRole('heading', { name: 'Home' });
    expect(auth.signedInWith).toEqual([{ phone: '14155550199', password: 'local-dev-password' }]);
  });

  it('says what to pass when there is no address', () => {
    renderAt('/dev-login');
    expect(screen.getByText(/Pass \?email=/)).toBeInTheDocument();
    expect(auth.signedInWith).toEqual([]);
  });

  it('shows a refusal rather than going on', async () => {
    auth.error = 'Invalid login credentials';
    renderAt('/dev-login?email=alfred@local.test');
    await waitFor(() => {
      expect(screen.getByText(/Could not sign in: Invalid login credentials/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull();
  });
});
