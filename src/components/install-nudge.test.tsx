import { Capacitor } from '@capacitor/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallNudge, InstallSettings } from '@/components/install-nudge';

// The app nudge keeps a code for Open in the app; no database here.
const issued: string[] = [];
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      issued.push(name);
      return Promise.resolve({ data: 'C'.repeat(43), error: null });
    },
  }),
}));

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

function browserIs(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

/** Past the moment it waits before showing. */
function renderAfterWait() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const view = render(
    <MemoryRouter initialEntries={['/events/7']}>
      <InstallNudge />
    </MemoryRouter>,
  );
  act(() => {
    vi.advanceTimersByTime(3100);
  });
  vi.useRealTimers();
  return view;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the Home Screen nudge', () => {
  // The owner, 2026-11-15: on an iPhone, the club's own app, opened signed in.
  it('offers the club’s app on an iPhone after a moment, opening it at this page signed in', async () => {
    browserIs(IPHONE_SAFARI);
    const opened: string[] = [];
    // Only its address is set: the app's link, then the App Store.
    const assign = vi.spyOn(window, 'location', 'get').mockReturnValue({
      get href() {
        return 'http://localhost/events/7';
      },
      set href(value: string) {
        opened.push(value);
      },
    } as unknown as Location);
    renderAfterWait();
    expect(screen.getByText('Get the club’s iPhone app')).toBeInTheDocument();
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
    await vi.waitFor(() => {
      expect(issued).toContain('issue_app_handoff');
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open in the app' }));
    expect(opened[0]).toBe(`thesciclub://open?path=%2Fevents%2F7&code=${'C'.repeat(43)}`);
    assign.mockRestore();
  });

  it('shows Safari’s Home Screen steps on Me, and says what to do if the app is signed out', async () => {
    browserIs(IPHONE_SAFARI);
    render(<InstallSettings />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show me how' }));
    const sheet = screen.getByRole('dialog', { name: 'Add the club to your Home Screen' });
    expect(sheet).toHaveTextContent('Tap Share');
    expect(sheet).toHaveTextContent('Add to Home Screen');
    expect(sheet).toHaveTextContent('sign in inside it');
    // iOS 26's Safari hides Share under ••• (the owner, 2026-10-11).
    expect(sheet).toHaveTextContent('tap ••• next to the address bar, then Share');
    expect(sheet).toHaveTextContent('Open as Web App');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes away for three days on Not now', async () => {
    browserIs(IPHONE_SAFARI);
    const view = renderAfterWait();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Get the club’s iPhone app')).toBeNull();
    view.unmount();
    renderAfterWait();
    expect(screen.queryByText('Get the club’s iPhone app')).toBeNull();
  });

  it('uses the browser’s own Install where it offers one', async () => {
    browserIs(ANDROID);
    const prompt = vi.fn(() => Promise.resolve());
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    renderAfterWait();
    act(() => {
      window.dispatchEvent(event);
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('does not offer the nudge on desktop', () => {
    browserIs(DESKTOP);
    renderAfterWait();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show me how' })).toBeNull();
  });

  it('stays hidden on desktop when Chrome offers a native prompt', async () => {
    browserIs(DESKTOP);
    renderAfterWait();
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: vi.fn(() => Promise.resolve()),
          userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
        }),
      );
    });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }));
  });

  it('offers manual installation on Android before Chrome supplies a native prompt', () => {
    browserIs(ANDROID);
    renderAfterWait();
    expect(screen.getByText('Put the club on your Home Screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show me how' })).toBeInTheDocument();
  });

  it('keeps a Chrome prompt caught before mounting available to the Install button', async () => {
    browserIs(ANDROID);
    const prompt = vi.fn(() => Promise.resolve());
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
      }),
    );
    renderAfterWait();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the manual steps if Chrome fails to open its native prompt', async () => {
    browserIs(ANDROID);
    renderAfterWait();
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: vi.fn(() => Promise.reject(new Error('Prompt expired'))),
          userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
        }),
      );
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Install app');
  });

  it('is not shown in the installed app', () => {
    browserIs(IPHONE_SAFARI);
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    renderAfterWait();
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
    Reflect.deleteProperty(navigator, 'standalone');
  });
});

describe('the steps on Me', () => {
  it('are there for a computer too', async () => {
    browserIs(DESKTOP);
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('install icon');
  });
});

describe('the iPhone steps match the phones', () => {
  it('sends Chrome to View More, where Add to Home Screen is', async () => {
    browserIs(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
    );
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tap View More');
  });

  it('sends Firefox on iPhone to Safari so the install keeps the name and icon', async () => {
    browserIs(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    );
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Use Safari to add the club with its name and icon.');
    expect(sheet).toHaveTextContent('Open thesciclub.com in Safari.');
    expect(sheet).toHaveTextContent('View More');
    expect(sheet).not.toHaveTextContent('at the top left beside the address');
  });
});

describe('in the store app', () => {
  it('never nudges, on an iPhone or on Android', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    browserIs(IPHONE_SAFARI);
    const view = renderAfterWait();
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
    browserIs(ANDROID);
    expect(renderAfterWait().container).toBeEmptyDOMElement();
  });

  it('has no Home Screen steps on Me', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    browserIs(IPHONE_SAFARI);
    const { container } = render(<InstallSettings />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Home Screen')).toBeNull();
  });
});

// The owner, 2026-10-28: Able Bodied's clip, filmed in Chrome on an iPhone.
describe('the how-to video', () => {
  const IPHONE_CHROME =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';

  // 2026-10-28: by itself, muted and on repeat, once the steps open.
  it('plays the clip from the site by itself, on repeat, once the steps open in Chrome', async () => {
    browserIs(IPHONE_CHROME);
    render(<InstallSettings />);
    expect(document.querySelector('video')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('src', '/video/how-to-add-to-home-screen.mp4');
    expect(video).toHaveAttribute('poster', '/video/how-to-add-to-home-screen.jpg');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('controls');
    expect(video?.muted).toBe(true);
  });

  it('waits for a tap where the phone asks for less motion', async () => {
    browserIs(IPHONE_CHROME);
    // jsdom has no matchMedia of its own.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    try {
      render(<InstallSettings />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
      const video = document.querySelector('video');
      expect(video).not.toHaveAttribute('autoplay');
      expect(video).toHaveAttribute('preload', 'none');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('plays with Safari’s steps too, much the same as Chrome’s', async () => {
    browserIs(IPHONE_SAFARI);
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    expect(document.querySelector('video')).not.toBeNull();
  });

  it('is not shown on Android, whose steps differ', async () => {
    browserIs(ANDROID);
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Show me how|Install/ }));
    expect(document.querySelector('video')).toBeNull();
  });
});
