import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessibilityProvider,
  DEFAULT_PREFERENCES,
  parsePreferences,
  systemDefaults,
  TEXT_SIZE_SCALE,
  useAccessibility,
} from '@/lib/accessibility';

const STORAGE_KEY = 'thesciclub.accessibility';

/** Pretend the OS asks for reduced motion, or does not. */
function mockPrefersReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  mockPrefersReducedMotion(false);
  document.documentElement.removeAttribute('data-text-size');
  document.documentElement.removeAttribute('data-large-targets');
  document.documentElement.removeAttribute('data-reduce-motion');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePreferences', () => {
  it('reads back what was written', () => {
    const stored = JSON.stringify({ textSize: 'large', largeTargets: true, reduceMotion: true });
    expect(parsePreferences(stored)).toEqual({
      textSize: 'large',
      largeTargets: true,
      reduceMotion: true,
    });
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

  it('survives junk', () => {
    expect(parsePreferences('not json')).toEqual({});
    expect(parsePreferences('null')).toEqual({});
    expect(parsePreferences('[1,2,3]')).toEqual({});
    expect(parsePreferences(null)).toEqual({});
  });
});

describe('systemDefaults', () => {
  it('starts reduced motion on when the OS asks for it', () => {
    mockPrefersReducedMotion(true);
    expect(systemDefaults().reduceMotion).toBe(true);
  });

  it('starts it off when the OS does not', () => {
    expect(systemDefaults().reduceMotion).toBe(false);
  });

  it('does not invent values for the settings the OS says nothing about', () => {
    mockPrefersReducedMotion(true);
    expect(systemDefaults().textSize).toBe(DEFAULT_PREFERENCES.textSize);
    expect(systemDefaults().largeTargets).toBe(DEFAULT_PREFERENCES.largeTargets);
  });
});

/** A component that shows what the hook returns and can change it. */
function Probe() {
  const { preferences, setPreference, reset } = useAccessibility();
  return (
    <div>
      <span data-testid="size">{preferences.textSize}</span>
      <span data-testid="motion">{String(preferences.reduceMotion)}</span>
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

  it('sets the scale variable the CSS zoom reads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'larger' }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe(
      String(TEXT_SIZE_SCALE.larger),
    );
  });

  it('takes the OS reduced-motion setting when nothing is stored', () => {
    mockPrefersReducedMotion(true);
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(screen.getByTestId('motion')).toHaveTextContent('true');
    expect(document.documentElement.dataset.reduceMotion).toBe('on');
  });

  it('lets a stored choice override the OS', () => {
    // Somebody may have the system flag on for a reason that is not this app.
    mockPrefersReducedMotion(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: false }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(document.documentElement.dataset.reduceMotion).toBe('off');
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

  it('reset goes back to the OS settings, not to a hardcoded off', () => {
    mockPrefersReducedMotion(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'larger', reduceMotion: false }));
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    return userEvent.click(screen.getByRole('button', { name: 'reset' })).then(() => {
      expect(screen.getByTestId('size')).toHaveTextContent('normal');
      expect(screen.getByTestId('motion')).toHaveTextContent('true');
    });
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
