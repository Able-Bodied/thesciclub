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
  linkTokenError: null as string | null,
  /** Whether Google's script loaded; 'unavailable' shows the club's button. */
  widget: 'unavailable',
  onToken: null as ((token: string, nonce: string) => void) | null,
}));

// Google's widget is Google's page in a frame; what is tested here is what the
// card does with the token it hands back.
vi.mock('@/lib/google-identity', () => ({
  useGoogleButton: ({ onToken }: { onToken: (token: string, nonce: string) => void }) => {
    google.onToken = onToken;
    return { ref: { current: null }, state: google.widget };
  },
}));

vi.mock('@/lib/google-sign-in', async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleSignInModule>()),
  loadGoogleIdentity: () => Promise.resolve({ ok: true, identity: google.identity }),
  linkGoogle: () => {
    google.calls.push('link');
    return Promise.resolve({ ok: true });
  },
  linkGoogleToken: (token: string, nonce: string) => {
    google.calls.push(`linkToken:${token}:${nonce}`);
    if (google.linkTokenError) {
      return Promise.resolve({ ok: false, error: google.linkTokenError });
    }
    google.identity = LINKED;
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
  google.linkTokenError = null;
  google.widget = 'unavailable';
  google.onToken = null;
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

describe('linking with the account picked in Google’s widget', () => {
  it('links it without leaving Me, and names it', async () => {
    google.widget = 'ready';
    renderIt();
    await screen.findByRole('button', { name: /Use Google’s sign-in page/ });
    google.onToken?.('id-token', 'raw-nonce');
    expect(
      await screen.findByText(
        'You can sign in with Google as nicole@gmail.com, or with your phone number.',
      ),
    ).toBeInTheDocument();
    expect(google.calls).toEqual(['linkToken:id-token:raw-nonce']);
  });

  it('says so when that Google account belongs to somebody else', async () => {
    google.widget = 'ready';
    google.linkTokenError = 'That Google account already signs in to another member.';
    renderIt();
    await screen.findByRole('button', { name: /Use Google’s sign-in page/ });
    google.onToken?.('id-token', 'raw-nonce');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already signs in to another member',
    );
  });

  // The way that does not depend on Google's window, for wherever it fails.
  it('still offers Google’s own page', async () => {
    google.widget = 'ready';
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: /Use Google’s sign-in page/ }));
    expect(google.calls).toEqual(['link']);
  });
});
