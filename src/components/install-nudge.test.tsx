import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallNudge, InstallSettings } from '@/components/install-nudge';

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
  const view = render(<InstallNudge />);
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
  it('waits a moment, then offers the steps on an iPhone, naming notifications', () => {
    browserIs(IPHONE_SAFARI);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<InstallNudge />);
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.getByText('Put the club on your Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/notifications on your iPhone/)).toBeInTheDocument();
  });

  it('shows Safari’s steps, and says the app signs in once more', async () => {
    browserIs(IPHONE_SAFARI);
    renderAfterWait();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show me how' }));
    const sheet = screen.getByRole('dialog', { name: 'Add the club to your Home Screen' });
    expect(sheet).toHaveTextContent('Tap Share');
    expect(sheet).toHaveTextContent('Add to Home Screen');
    expect(sheet).toHaveTextContent('sign in once more');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes away for two weeks on Not now', async () => {
    browserIs(IPHONE_SAFARI);
    const view = renderAfterWait();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
    view.unmount();
    renderAfterWait();
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
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

  it('is not shown on a computer', () => {
    browserIs(DESKTOP);
    renderAfterWait();
    expect(screen.queryByText('Put the club on your Home Screen')).toBeNull();
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

  it('sends Firefox to Share at the top left, then View More', async () => {
    browserIs(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    );
    render(<InstallSettings />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show me how' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('at the top left beside the address');
    expect(sheet).toHaveTextContent('View More');
    expect(sheet).not.toHaveTextContent('☰');
  });
});
