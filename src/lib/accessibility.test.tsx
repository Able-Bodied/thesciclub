import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessibilityProvider,
  BROWSER_BAR,
  DEFAULT_PREFERENCES,
  motionReduced,
  parsePreferences,
  systemDefaults,
  TEXT_SIZE_SCALE,
  useAccessibility,
  useForceLight,
} from '@/lib/accessibility';

const STORAGE_KEY = 'thesciclub.accessibility';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-text-size');
  document.documentElement.removeAttribute('data-large-targets');
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-force-light');
  document.documentElement.removeAttribute('data-reduce-motion');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePreferences', () => {
  it('reads back what was written', () => {
    const stored = JSON.stringify({ textSize: 'large', largeTargets: true });
    expect(parsePreferences(stored)).toEqual({ textSize: 'large', largeTargets: true });
  });

  it('drops a setting we no longer have', () => {
    expect(parsePreferences(JSON.stringify({ zoom: 2 }))).toEqual({});
  });

  it('drops the old true/false Reduce motion rather than guessing', () => {
    expect(parsePreferences(JSON.stringify({ reduceMotion: true }))).toEqual({});
  });

  it('reads back the settings added 2026-10-20', () => {
    const stored = JSON.stringify({
      highContrast: true,
      reduceMotion: 'on',
      underlineLinks: true,
      readableText: false,
    });
    expect(parsePreferences(stored)).toEqual({
      highContrast: true,
      reduceMotion: 'on',
      underlineLinks: true,
      readableText: false,
    });
  });

  it('ignores junk in the settings added 2026-10-20', () => {
    const stored = JSON.stringify({
      highContrast: 'yes',
      reduceMotion: 'sometimes',
      underlineLinks: 1,
      readableText: null,
    });
    expect(parsePreferences(stored)).toEqual({});
  });

  it('ignores a text size that is not one of ours', () => {
    // This string is user-writable. A bad value would reach the DOM as an
    // attribute matching no rule, leaving somebody stuck at a size they did not
    // pick with nothing on screen explaining why.
    expect(parsePreferences(JSON.stringify({ textSize: 'enormous' }))).toEqual({});
  });

  it('ignores a non-boolean toggle', () => {
    expect(parsePreferences(JSON.stringify({ largeTargets: 'yes' }))).toEqual({});
  });

  it('keeps the good fields when one is bad', () => {
    const stored = JSON.stringify({ textSize: 'larger', largeTargets: 'nope' });
    expect(parsePreferences(stored)).toEqual({ textSize: 'larger' });
  });

  it('reads back a chosen appearance', () => {
    expect(parsePreferences(JSON.stringify({ appearance: 'dark' }))).toEqual({
      appearance: 'dark',
    });
  });

  it('ignores an appearance that is not one of ours', () => {
    // As with text size: an unknown value would reach <html> as an attribute
    // no rule matches, and the theme would silently stop following the choice.
    expect(parsePreferences(JSON.stringify({ appearance: 'sepia' }))).toEqual({});
  });

  it('survives junk', () => {
    expect(parsePreferences('not json')).toEqual({});
    expect(parsePreferences('null')).toEqual({});
    expect(parsePreferences('[1,2,3]')).toEqual({});
    expect(parsePreferences(null)).toEqual({});
  });
});

describe('systemDefaults', () => {
  it('is just the defaults, with motion left to the phone', () => {
    expect(systemDefaults()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.reduceMotion).toBe('system');
  });
});

function phoneReducesMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('motionReduced', () => {
  it('follows the phone on Match my device', () => {
    document.documentElement.dataset.reduceMotion = 'system';
    phoneReducesMotion(true);
    expect(motionReduced()).toBe(true);
    phoneReducesMotion(false);
    expect(motionReduced()).toBe(false);
  });

  it('On stops motion on a phone that allows it', () => {
    document.documentElement.dataset.reduceMotion = 'on';
    phoneReducesMotion(false);
    expect(motionReduced()).toBe(true);
  });

  it('Off allows motion on a phone that reduces it', () => {
    document.documentElement.dataset.reduceMotion = 'off';
    phoneReducesMotion(true);
    expect(motionReduced()).toBe(false);
  });
});

/** A component that shows what the hook returns and can change it. */
function Probe() {
  const { preferences, setPreference, reset } = useAccessibility();
  return (
    <div>
      <span data-testid="size">{preferences.textSize}</span>
      <button
        type="button"
        onClick={() => {
          setPreference('textSize', 'larger');
        }}
      >
        bigger
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  );
}

describe('AccessibilityProvider', () => {
  it('applies stored preferences to the document', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'large', largeTargets: true }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(document.documentElement.dataset.largeTargets).toBe('on');
  });

  it('puts the settings added 2026-10-20 on the document', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ highContrast: true, reduceMotion: 'on', underlineLinks: true }),
    );
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    const root = document.documentElement.dataset;
    expect(root.highContrast).toBe('on');
    expect(root.reduceMotion).toBe('on');
    expect(root.underlineLinks).toBe('on');
    expect(root.readableText).toBe('off');
  });

  // Match my device is the default: somebody whose phone is dark gets a dark
  // club without finding the setting (the owner, 2026-10-02).
  it('follows the device until somebody chooses', () => {
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.dataset.appearance).toBe('system');
  });

  it('puts a chosen appearance on the document, where the dark colours read it', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: 'dark' }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('colours the browser bar to match: charcoal for Dark, navy for Light', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#102A4C';
    document.head.append(meta);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: 'dark' }));
    const { unmount } = render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(meta.content).toBe(BROWSER_BAR.dark);
    unmount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: 'light' }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(meta.content).toBe(BROWSER_BAR.light);
    meta.remove();
  });

  it('sets the multiplier the root font size reads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'larger' }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe(
      String(TEXT_SIZE_SCALE.larger),
    );
  });

  it('persists a change', async () => {
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'bigger' }));
    expect(screen.getByTestId('size')).toHaveTextContent('larger');
    expect(parsePreferences(localStorage.getItem(STORAGE_KEY)).textSize).toBe('larger');
  });

  it('reset goes back to the defaults', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'larger', largeTargets: true }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.getByTestId('size')).toHaveTextContent('normal');
  });

  it('still renders when storage throws', () => {
    // Private mode, or a browser set to block site data. Losing the preference
    // is acceptable; refusing to render the app is not.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() =>
      render(
        <AccessibilityProvider>
          <Probe />
        </AccessibilityProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('size')).toHaveTextContent('normal');
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('useAccessibility without a provider', () => {
  it('returns the defaults rather than throwing', () => {
    // So a component can be rendered in isolation without being wrapped.
    render(<Probe />);
    expect(screen.getByTestId('size')).toHaveTextContent('normal');
  });
});

function JoinScreen() {
  useForceLight();
  return <p>joining</p>;
}

// The owner, 2026-10-03: nobody sees dark until they are in the club, and the
// opt-in matches the light screenshots registered with the carriers.
describe('useForceLight', () => {
  it('draws its screen in light over a Dark choice, without changing the choice', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: 'dark' }));
    const { unmount } = render(
      <AccessibilityProvider>
        <JoinScreen />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.dataset.forceLight).toBe('');
    expect(document.documentElement.dataset.appearance).toBe('dark');
    expect(parsePreferences(localStorage.getItem(STORAGE_KEY)).appearance).toBe('dark');
    unmount();
    expect(document.documentElement.dataset.forceLight).toBeUndefined();
  });
});
