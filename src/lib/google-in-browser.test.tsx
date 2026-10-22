import { Capacitor } from '@capacitor/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supa = vi.hoisted(() => ({ invoke: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    functions: { invoke: supa.invoke },
    auth: { verifyOtp: supa.verifyOtp },
  }),
}));

const {
  browserAddress,
  browserOrder,
  COLLECT_EVERY_MS,
  COULD_NOT_OPEN,
  collectPairing,
  forgetPairing,
  googleGoesToBrowser,
  makePairing,
  openInBrowser,
  PENDING_MS,
  pairingFor,
  pendingPairing,
  TRY_SAFARI,
  tryOpen,
  useGoogleInBrowser,
} = await import('@/lib/google-in-browser');
const { GoogleInBrowserButton } = await import('@/components/google-in-browser-button');

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const PAIRING = 'a'.repeat(64);

let visibility: DocumentVisibilityState = 'visible';

function on(userAgent: string, homeScreen: boolean) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: homeScreen });
}
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  localStorage.clear();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  supa.invoke.mockReset();
  supa.verifyOtp.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('where Google goes by way of a browser', () => {
  it('is the iPhone Home Screen app only', () => {
    on(IPHONE, true);
    expect(googleGoesToBrowser()).toBe(true);
    on(IPHONE, false);
    expect(googleGoesToBrowser()).toBe(false);
    Reflect.deleteProperty(navigator, 'standalone');
    on(ANDROID, true);
    Reflect.deleteProperty(navigator, 'standalone');
    expect(googleGoesToBrowser()).toBe(false);
  });
});

describe('in the store app', () => {
  it('never goes by way of a browser, which could not come back', () => {
    on(IPHONE, true);
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(googleGoesToBrowser()).toBe(false);
  });
});

describe('the pairing', () => {
  // The database finds the pairing by hashing the secret itself
  // (redeem_home_screen_pairing). If these drift, no sign-in ever arrives.
  it('is the SHA-256 hex of the secret, as Postgres digest() gives it', async () => {
    expect(await pairingFor('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const { secret, pairing } = await makePairing();
    expect(pairing).toBe(await pairingFor(secret));
  });

  it('has a secret the edge function accepts, new every time', async () => {
    const [a, b] = await Promise.all([makePairing(), makePairing()]);
    expect(a.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.pairing).toMatch(/^[0-9a-f]{64}$/);
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('the browser addresses', () => {
  it('open /app-sign-in in Chrome or Safari, with the pairing and not the secret', () => {
    expect(browserAddress('chrome', PAIRING, 'https://thesciclub.com/join')).toBe(
      `googlechromes://thesciclub.com/app-sign-in?pairing=${PAIRING}`,
    );
    expect(browserAddress('safari', PAIRING, 'https://thesciclub.com')).toBe(
      `x-safari-https://thesciclub.com/app-sign-in?pairing=${PAIRING}`,
    );
    expect(browserAddress('chrome', PAIRING, 'http://localhost:5183')).toBe(
      `googlechrome://localhost:5183/app-sign-in?pairing=${PAIRING}`,
    );
    expect(browserAddress('safari', PAIRING, 'http://localhost:5183')).toBe(
      `x-safari-http://localhost:5183/app-sign-in?pairing=${PAIRING}`,
    );
  });

  it('try Chrome first, unless another browser opened last time', () => {
    expect(browserOrder(null)).toEqual(['chrome', 'safari']);
    expect(browserOrder('chrome')).toEqual(['chrome', 'safari']);
    expect(browserOrder('safari')).toEqual(['safari', 'chrome']);
  });
});

describe('trying a browser', () => {
  it('counts the app going into the background as opened', async () => {
    const go = vi.fn(() => {
      setVisibility('hidden');
    });
    expect(await tryOpen('googlechromes://x', go, 800)).toBe(true);
    expect(go).toHaveBeenCalledWith('googlechromes://x');
  });

  it('counts nothing happening, for the wait, as not installed', async () => {
    vi.useFakeTimers();
    const opened = tryOpen('googlechromes://x', () => undefined, 800);
    await vi.advanceTimersByTimeAsync(799);
    let settled = false;
    void opened.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await opened).toBe(false);
  });

  it('waits past the wait while iOS asks, and takes a yes as opened', async () => {
    vi.useFakeTimers();
    const opened = tryOpen(
      'googlechromes://x',
      () => {
        window.dispatchEvent(new Event('blur'));
      },
      800,
    );
    await vi.advanceTimersByTimeAsync(5000);
    setVisibility('hidden');
    expect(await opened).toBe(true);
  });

  it('takes a no to iOS asking as not opened', async () => {
    const opened = tryOpen(
      'googlechromes://x',
      () => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      },
      800,
    );
    expect(await opened).toBe(false);
  });
});

describe('opening a browser', () => {
  it('tries Safari when Chrome does not open, and remembers Safari', async () => {
    const tried: string[] = [];
    const open = vi.fn((href: string) => Promise.resolve(href.startsWith('x-safari')));
    expect(await openInBrowser(PAIRING, (b) => tried.push(b), open)).toBe('safari');
    expect(tried).toEqual(['chrome', 'safari']);

    tried.length = 0;
    open.mockClear();
    expect(await openInBrowser(PAIRING, (b) => tried.push(b), open)).toBe('safari');
    expect(tried).toEqual(['safari']);
  });

  it('answers null when neither opens', async () => {
    expect(
      await openInBrowser(
        PAIRING,
        () => undefined,
        () => Promise.resolve(false),
      ),
    ).toBe(null);
  });
});

describe('collecting the sign-in', () => {
  it('trades the secret, never the pairing, for a session', async () => {
    supa.invoke.mockResolvedValue({ data: { token_hash: 'th' }, error: null });
    supa.verifyOtp.mockResolvedValue({ error: null });
    expect(await collectPairing('s'.repeat(43))).toBe('signed-in');
    expect(supa.invoke).toHaveBeenCalledWith('home-screen-handoff', {
      body: { pairing: 's'.repeat(43) },
    });
    expect(supa.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'email' });
  });

  it('is not yet while the browser has left nothing', async () => {
    supa.invoke.mockResolvedValue({ data: null, error: new Error('404') });
    expect(await collectPairing('s'.repeat(43))).toBe('not-yet');
    expect(supa.verifyOtp).not.toHaveBeenCalled();
  });

  it('failed when the one-time sign-in is refused', async () => {
    supa.invoke.mockResolvedValue({ data: { token_hash: 'th' }, error: null });
    supa.verifyOtp.mockResolvedValue({ error: new Error('expired') });
    expect(await collectPairing('s'.repeat(43))).toBe('failed');
  });

  it('forgets a request older than its ten minutes', () => {
    const now = Date.now();
    localStorage.setItem(
      'club:google-pairing',
      JSON.stringify({ secret: 's', pairing: 'p', startedAt: now - PENDING_MS + 1000 }),
    );
    expect(pendingPairing(now)?.secret).toBe('s');
    expect(pendingPairing(now + 1000)).toBe(null);
    expect(localStorage.getItem('club:google-pairing')).toBe(null);
    forgetPairing();
  });
});

function Harness({ attempt }: { attempt: (href: string) => Promise<boolean> }) {
  const google = useGoogleInBrowser(attempt);
  if (!google) return <p>Google's own button</p>;
  return <GoogleInBrowserButton google={google} label="Sign in with Google" />;
}

describe('the Home Screen app button', () => {
  it('is not used anywhere else', () => {
    on(IPHONE, false);
    render(<Harness attempt={() => Promise.resolve(true)} />);
    expect(screen.getByText("Google's own button")).toBeInTheDocument();
  });

  it('opens Chrome, waits, and signs in when the app is back in front', async () => {
    on(IPHONE, true);
    supa.invoke.mockResolvedValue({ data: { token_hash: 'th' }, error: null });
    supa.verifyOtp.mockResolvedValue({ error: null });
    const attempt = vi.fn((href: string) => {
      visibility = 'hidden';
      return Promise.resolve(href.startsWith('googlechrome'));
    });
    render(<Harness attempt={attempt} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('Finish in Chrome')).toBeInTheDocument();
    // Away in Chrome: nothing asked for yet.
    expect(supa.invoke).not.toHaveBeenCalled();
    const pending = pendingPairing();
    expect(attempt).toHaveBeenCalledWith(
      browserAddress('chrome', pending?.pairing ?? '', window.location.origin),
    );

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(supa.verifyOtp).toHaveBeenCalled();
    });
    expect(supa.invoke).toHaveBeenCalledWith('home-screen-handoff', {
      body: { pairing: pending?.secret },
    });
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(pendingPairing()).toBe(null);
  });

  it('asks a few times while the member is still confirming, then waits for the next return', async () => {
    on(IPHONE, true);
    vi.useFakeTimers();
    supa.invoke.mockResolvedValue({ data: null, error: new Error('404') });
    localStorage.setItem(
      'club:google-pairing',
      JSON.stringify({ secret: 's'.repeat(43), pairing: PAIRING, startedAt: Date.now() }),
    );
    render(<Harness attempt={() => Promise.resolve(true)} />);
    expect(screen.getByText('Finish in your browser')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COLLECT_EVERY_MS * 10);
    });
    expect(supa.invoke).toHaveBeenCalledTimes(5);
    await act(async () => {
      setVisibility('hidden');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(supa.invoke).toHaveBeenCalledTimes(6);
  });

  it('opens the first browser in the tap itself, with nothing awaited first', async () => {
    on(IPHONE, true);
    const attempt = vi.fn((_href: string) => new Promise<boolean>(() => undefined));
    render(<Harness attempt={attempt} />);
    // The pairing is made as the button is drawn.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    // Synchronously, inside the click: iOS opens another app only from a tap.
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[0]?.[0]).toMatch(/^googlechrome/);
  });

  it('when Chrome does not open, sends the next tap to Safari first', async () => {
    on(IPHONE, true);
    const attempt = vi.fn((_href: string) => Promise.resolve(false));
    render(<Harness attempt={attempt} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TRY_SAFARI);
    expect(pendingPairing()).toBe(null);

    attempt.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText(COULD_NOT_OPEN)).toBeInTheDocument();
    expect(attempt.mock.calls.map(([href]) => href.split(':')[0])).toEqual([
      'x-safari-http',
      'googlechrome',
    ]);
  });

  it('Cancel forgets the request', async () => {
    on(IPHONE, true);
    render(<Harness attempt={() => Promise.resolve(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    visibility = 'hidden';
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(pendingPairing()).toBe(null);
  });
});
