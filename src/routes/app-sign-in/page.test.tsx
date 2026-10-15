import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: string, session: unknown) => void;
interface Fake {
  session: unknown;
  listeners: Listener[];
  onToken: ((token: string, nonce: string) => void) | null;
}
const fake = vi.hoisted(() => {
  const state: Fake = { session: null, listeners: [], onToken: null };
  return Object.assign(state, { rpc: vi.fn(), signOut: vi.fn(), signInWithIdToken: vi.fn() });
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: fake.rpc,
    auth: {
      getSession: () => Promise.resolve({ data: { session: fake.session } }),
      onAuthStateChange: (listener: Listener) => {
        fake.listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: fake.signOut,
      signInWithIdToken: fake.signInWithIdToken,
    },
  }),
}));
vi.mock('@/lib/google-identity', () => ({
  useGoogleButton: ({ onToken }: { onToken: (token: string, nonce: string) => void }) => {
    fake.onToken = onToken;
    return { ref: { current: null }, state: 'ready' };
  },
}));

const { default: AppSignInPage } = await import('@/routes/app-sign-in/page');

const PAIRING = 'b'.repeat(64);
const SIGNED_IN = { user: { email: 'dana@example.com' } };

function signIn(session: unknown) {
  fake.session = session;
  for (const listener of fake.listeners) listener('SIGNED_IN', session);
}

function show(pairing = PAIRING) {
  render(
    <MemoryRouter initialEntries={[`/app-sign-in?pairing=${pairing}`]}>
      <AppSignInPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fake.session = null;
  fake.listeners = [];
  fake.onToken = null;
  fake.rpc.mockReset();
  fake.signOut.mockReset().mockResolvedValue({ error: null });
  fake.signInWithIdToken.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('/app-sign-in', () => {
  it('signed out, offers Google, and confirms once Google has signed in', async () => {
    show();
    expect(await screen.findByText('Sign in to the SCI Club app')).toBeInTheDocument();
    fake.onToken?.('the-token', 'the-nonce');
    expect(fake.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'the-token',
      nonce: 'the-nonce',
    });
    signIn(SIGNED_IN);
    expect(await screen.findByText('Sign in the app?')).toBeInTheDocument();
    // Never handed over without the member saying so.
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('says who the app will be signed in as, and leaves the sign-in on Continue', async () => {
    fake.session = SIGNED_IN;
    fake.rpc.mockResolvedValue({ data: true, error: null });
    show();
    expect(await screen.findByText('dana@example.com')).toBeInTheDocument();
    expect(screen.getByText(/If somebody sent you this link, close this page/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Now go back to the app')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('pair_home_screen_app', { pairing: PAIRING });
  });

  it('a pairing another account filled cannot be used', async () => {
    fake.session = SIGNED_IN;
    fake.rpc.mockResolvedValue({ data: false, error: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('This sign-in cannot be used')).toBeInTheDocument();
  });

  it('a malformed pairing is refused before anything is asked', async () => {
    fake.session = SIGNED_IN;
    show('not-a-pairing');
    expect(await screen.findByText('This sign-in cannot be used')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('a different account signs out this browser only', async () => {
    fake.session = SIGNED_IN;
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different account' }));
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('opened in the Home Screen app itself, says to use a browser', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    );
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    fake.session = SIGNED_IN;
    show();
    expect(await screen.findByText('Open this in Chrome or Safari')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});
