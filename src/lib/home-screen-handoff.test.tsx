import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Fake {
  session: unknown;
  sessionState: { status: string; userId?: string };
}
const auth = vi.hoisted(() => {
  const fake: Fake = { session: null, sessionState: { status: 'signed-in', userId: 'u1' } };
  return Object.assign(fake, { rpc: vi.fn(), invoke: vi.fn(), verifyOtp: vi.fn() });
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: auth.rpc,
    functions: { invoke: auth.invoke },
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session } }),
      verifyOtp: auth.verifyOtp,
    },
  }),
}));
vi.mock('@/lib/session', () => ({ useSession: () => auth.sessionState }));

const {
  HANDOFF_COOKIE,
  forgetHandoff,
  handoffApplies,
  heldHandoff,
  leaveHandoff,
  LeaveHomeScreenHandoff,
  takeHandoff,
} = await import('@/lib/home-screen-handoff');

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const CODE = 'c'.repeat(43);

function on(userAgent: string, homeScreen: boolean) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: homeScreen });
}
function holdCookie(code: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: the test plays iOS copying the cookie in.
  document.cookie = `${HANDOFF_COOKIE}=${code}; Path=/`;
}

beforeEach(() => {
  forgetHandoff();
  auth.rpc.mockReset().mockResolvedValue({ data: CODE, error: null });
  auth.invoke.mockReset().mockResolvedValue({ data: { token_hash: 'the-hash' }, error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.session = null;
  auth.sessionState = { status: 'signed-in', userId: 'u1' };
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('where it applies', () => {
  it('is an iPhone browser tab only', () => {
    on(IPHONE, false);
    expect(handoffApplies()).toBe(true);
    on(IPHONE, true);
    expect(handoffApplies()).toBe(false);
    Reflect.deleteProperty(navigator, 'standalone');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    expect(handoffApplies()).toBe(false);
  });
});

describe('leaving a code in Safari', () => {
  it('keeps the code it is given in the cookie', async () => {
    expect(await leaveHandoff()).toBe(true);
    expect(auth.rpc).toHaveBeenCalledWith('issue_home_screen_handoff');
    expect(heldHandoff()).toBe(CODE);
  });

  it('keeps nothing when refused', async () => {
    auth.rpc.mockResolvedValue({ data: null, error: { message: 'no' } });
    expect(await leaveHandoff()).toBe(false);
    expect(heldHandoff()).toBeNull();
  });

  it('a signed-in iPhone tab leaves one as it opens', async () => {
    on(IPHONE, false);
    render(<LeaveHomeScreenHandoff />);
    await vi.waitFor(() => {
      expect(heldHandoff()).toBe(CODE);
    });
  });

  it('signing out takes it away', () => {
    on(IPHONE, false);
    holdCookie(CODE);
    auth.sessionState = { status: 'signed-out' };
    render(<LeaveHomeScreenHandoff />);
    expect(heldHandoff()).toBeNull();
    expect(auth.rpc).not.toHaveBeenCalled();
  });

  it('Android leaves none: its installed app shares the sign-in', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    render(<LeaveHomeScreenHandoff />);
    expect(auth.rpc).not.toHaveBeenCalled();
    expect(heldHandoff()).toBeNull();
  });
});

describe('taking it in the Home Screen app', () => {
  it('trades the copied code for a session of its own, and lets the cookie go', async () => {
    on(IPHONE, true);
    holdCookie(CODE);
    expect(await takeHandoff()).toBe('signed-in');
    expect(auth.invoke).toHaveBeenCalledWith('home-screen-handoff', { body: { code: CODE } });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'the-hash', type: 'email' });
    expect(heldHandoff()).toBeNull();
  });

  it('a refused code still lets the cookie go, and the app opens at sign-in', async () => {
    on(IPHONE, true);
    holdCookie(CODE);
    auth.invoke.mockResolvedValue({ data: null, error: { message: '404' } });
    expect(await takeHandoff()).toBe('refused');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(heldHandoff()).toBeNull();
  });

  it('does nothing in a browser tab, which has its own sign-in', async () => {
    on(IPHONE, false);
    holdCookie(CODE);
    expect(await takeHandoff()).toBe('none');
    expect(auth.invoke).not.toHaveBeenCalled();
    expect(heldHandoff()).toBe(CODE);
  });

  it('does nothing when the app is already signed in', async () => {
    on(IPHONE, true);
    holdCookie(CODE);
    auth.session = { user: { id: 'u1' } };
    expect(await takeHandoff()).toBe('none');
    expect(auth.invoke).not.toHaveBeenCalled();
  });

  it('does nothing without a code', async () => {
    on(IPHONE, true);
    expect(await takeHandoff()).toBe('none');
    expect(auth.invoke).not.toHaveBeenCalled();
  });
});
