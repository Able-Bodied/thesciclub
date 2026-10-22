import { Capacitor } from '@capacitor/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type * as GoogleSignInModule from '@/lib/google-sign-in';
import type * as NativeSignIn from '@/lib/native-sign-in';

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

// Google's sheet in the store app: what the card does with its answer.
const nativeSheet = vi.hoisted(() => ({ calls: 0, cancelled: false }));
vi.mock('@/lib/native-sign-in', async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSignIn>()),
  linkGoogleNatively: () => {
    nativeSheet.calls += 1;
    if (nativeSheet.cancelled) return Promise.resolve({ ok: false, error: null });
    google.identity = LINKED;
    return Promise.resolve({ ok: true, name: null });
  },
}));

const changed = vi.fn();
const { GoogleSignIn } = await import('@/routes/me/google-sign-in');

function Where() {
  return <p data-testid="where">{useLocation().search}</p>;
}

function renderIt(path = '/me', canUnlink = true) {
  render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/me"
            element={
              <>
                <GoogleSignIn canUnlink={canUnlink} onChanged={changed} />
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
  nativeSheet.calls = 0;
  nativeSheet.cancelled = false;
  changed.mockClear();
});

describe('in the store app', () => {
  let native: { mockRestore: () => void } | null = null;
  let platform: { mockRestore: () => void } | null = null;
  afterEach(() => {
    native?.mockRestore();
    platform?.mockRestore();
    vi.unstubAllEnvs();
  });

  function onAnIphone() {
    native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    platform = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', '123456789012-abc.apps.googleusercontent.com');
  }

  it('on an iPhone, links Google with Google’s own sheet, not the website’s widget', async () => {
    onAnIphone();
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Link Google' }));
    expect(nativeSheet.calls).toBe(1);
    expect(google.onToken).toBeNull();
    expect(google.calls).toEqual([]);
    expect(
      await screen.findByText('You can sign in with Google as nicole@gmail.com.'),
    ).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
  });

  it('says nothing when Google’s sheet is closed', async () => {
    onAnIphone();
    nativeSheet.cancelled = true;
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Link Google' }));
    await waitFor(() => {
      expect(nativeSheet.calls).toBe(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('offers no Link Google where it cannot link it natively', async () => {
    native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    renderIt();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('heading', { name: 'Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link Google' })).toBeNull();
  });

  it('still names a linked Google and lets it go', async () => {
    native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    google.identity = LINKED;
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    expect(google.calls).toEqual(['unlink']);
  });
});

describe('Signing in, on Me', () => {
  it('offers to link Google when it is not linked', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Link Google' }));
    expect(google.calls).toEqual(['link']);
  });

  it('names the linked account', async () => {
    google.identity = LINKED;
    renderIt();
    expect(
      await screen.findByText('You can sign in with Google as nicole@gmail.com.'),
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

describe('the last way in', () => {
  // Nobody is left with nothing: with Google the only way in, Unlink is not
  // offered, and the card says what to add first.
  it('offers no Unlink when Google is the only way in', async () => {
    google.identity = LINKED;
    renderIt('/me', false);
    expect(await screen.findByText(/It is your only way in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink Google' })).not.toBeInTheDocument();
  });

  it('tells Me to read the account again after linking and unlinking', async () => {
    google.identity = LINKED;
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    await screen.findByRole('button', { name: 'Link Google' });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('linking with the account picked in Google’s widget', () => {
  it('links it without leaving Me, and names it', async () => {
    google.widget = 'ready';
    renderIt();
    await screen.findByRole('button', { name: /Use Google’s sign-in page/ });
    google.onToken?.('id-token', 'raw-nonce');
    expect(
      await screen.findByText('You can sign in with Google as nicole@gmail.com.'),
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
