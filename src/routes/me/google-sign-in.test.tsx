import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type * as GoogleSignInModule from '@/lib/google-sign-in';

const google = vi.hoisted(() => ({
  identity: null as Record<string, unknown> | null,
  calls: [] as string[],
  unlinkError: null as string | null,
}));

vi.mock('@/lib/google-sign-in', async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleSignInModule>()),
  loadGoogleIdentity: () => Promise.resolve({ ok: true, identity: google.identity }),
  linkGoogle: () => {
    google.calls.push('link');
    return Promise.resolve({ ok: true });
  },
  unlinkGoogle: () => {
    google.calls.push('unlink');
    return Promise.resolve(
      google.unlinkError ? { ok: false, error: google.unlinkError } : { ok: true },
    );
  },
}));

const { GoogleSignIn } = await import('@/routes/me/google-sign-in');

function Where() {
  return <p data-testid="where">{useLocation().search}</p>;
}

function renderIt(path = '/me') {
  render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/me"
            element={
              <>
                <GoogleSignIn />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </AnnounceProvider>,
  );
}

const LINKED = {
  identity_id: 'i1',
  id: 'g1',
  user_id: 'u1',
  provider: 'google',
  identity_data: { email: 'nicole@gmail.com' },
};

beforeEach(() => {
  google.identity = null;
  google.calls = [];
  google.unlinkError = null;
});

describe('Signing in, on Me', () => {
  it('offers to link Google when it is not linked', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Link Google' }));
    expect(google.calls).toEqual(['link']);
  });

  it('names the linked account and keeps the phone number as a way in', async () => {
    google.identity = LINKED;
    renderIt();
    expect(
      await screen.findByText(
        'You can sign in with Google as nicole@gmail.com, or with your phone number.',
      ),
    ).toBeInTheDocument();
  });

  it('unlinks, and goes back to offering the link', async () => {
    google.identity = LINKED;
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    expect(google.calls).toEqual(['unlink']);
    expect(await screen.findByRole('button', { name: 'Link Google' })).toBeInTheDocument();
  });

  it('says so when unlinking fails, and leaves it linked', async () => {
    google.identity = LINKED;
    google.unlinkError = 'Google is still linked.';
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Google is still linked.');
    expect(screen.getByRole('button', { name: 'Unlink Google' })).toBeInTheDocument();
  });

  // Cancel at Google comes back the same way as a link that worked, so the
  // sentence is chosen from what is actually linked.
  it('says Google was not linked when it comes back with nothing linked', async () => {
    renderIt('/me?google=linked');
    expect(await screen.findByRole('alert')).toHaveTextContent('Google was not linked.');
    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
    });
  });

  it('says nothing is wrong when it comes back linked', async () => {
    google.identity = LINKED;
    renderIt('/me?google=linked');
    expect(await screen.findByRole('button', { name: 'Unlink Google' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
