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

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-text-size');
  document.documentElement.removeAttribute('data-large-targets');
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
    // A device that stored reduceMotion before it was removed must not carry
    // it back into state as an unknown key.
    expect(parsePreferences(JSON.stringify({ reduceMotion: true }))).toEqual({});
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
  it('is just the defaults — the OS is asked nothing', () => {
    // Reduced motion used to be seeded from the OS here. It was removed with
    // the toggle it fed; the media query in index.css covers it with no UI.
    expect(systemDefaults()).toEqual(DEFAULT_PREFERENCES);
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
