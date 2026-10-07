import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstalledApp } from '@/components/installed-app';

let installed: boolean;
let changed: (() => void) | undefined;

function Screen() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(false);
  return (
    <>
      <InstalledApp />
      <p data-testid="path">{pathname}</p>
      <main data-testid="surface">Screen</main>
      <input aria-label="Words" />
      <button
        type="button"
        onClick={() => {
          setDialog(true);
        }}
      >
        Open sheet
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/next');
        }}
      >
        Next
      </button>
      {dialog && (
        <div role="dialog" aria-label="Sheet">
          Sheet
        </div>
      )}
    </>
  );
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/home', '/detail']} initialIndex={1}>
      <Screen />
    </MemoryRouter>,
  );
}

function touch(type: string, target: Element, points: [number, number][]) {
  const fingers = points.map(([clientX, clientY], identifier) => ({
    clientX,
    clientY,
    identifier,
  }));
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : fingers },
    changedTouches: { value: fingers },
  });
  fireEvent(target, event);
  return event;
}

function swipe(target = screen.getByTestId('surface'), x = 8, endX = 110, endY = 102) {
  touch('touchstart', target, [[x, 100]]);
  touch('touchmove', target, [[endX, endY]]);
  return touch('touchend', target, [[endX, endY]]);
}

beforeEach(() => {
  installed = true;
  changed = undefined;
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    get matches() {
      return installed;
    },
    addEventListener: (_: string, listener: () => void) => {
      changed = listener;
    },
    removeEventListener: () => {
      changed = undefined;
    },
  }));
  window.history.replaceState({ idx: 1 }, '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '');
});

describe('the installed app', () => {
  it('leaves zoom and swipe alone in a browser tab', () => {
    installed = false;
    open();
    expect(document.documentElement.dataset.installedApp).toBeUndefined();
    expect(swipe().defaultPrevented).toBe(false);
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
    const pinch = touch('touchmove', document.body, [
      [10, 10],
      [30, 30],
    ]);
    expect(pinch.defaultPrevented).toBe(false);
  });

  it('recognizes Safari’s Home Screen flag even without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('navigator', { standalone: true });
    open();
    expect(document.documentElement.dataset.installedApp).toBe('');
  });

  it('blocks pinch gestures and removes its handlers when unmounted', () => {
    const { unmount } = open();
    expect(document.documentElement.dataset.installedApp).toBe('');
    expect(
      touch('touchmove', document.body, [
        [10, 10],
        [30, 30],
      ]).defaultPrevented,
    ).toBe(true);
    for (const type of ['gesturestart', 'gesturechange']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      fireEvent(document.body, event);
      expect(event.defaultPrevented).toBe(true);
    }
    unmount();
    expect(document.documentElement.dataset.installedApp).toBeUndefined();
    expect(
      touch('touchmove', document.body, [
        [10, 10],
        [30, 30],
      ]).defaultPrevented,
    ).toBe(false);
  });

  it('follows a change back into browser mode', () => {
    open();
    installed = false;
    act(() => changed?.());
    expect(document.documentElement.dataset.installedApp).toBeUndefined();
    expect(swipe().defaultPrevented).toBe(false);
  });

  it('leaves a rightward swipe from the left edge to the phone', () => {
    open();
    expect(swipe().defaultPrevented).toBe(false);
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
  });

  it.each([
    ['from the middle', 100, 220, 100],
    ['a short swipe', 8, 40, 100],
    ['a vertical scroll', 8, 20, 220],
    ['a diagonal scroll', 8, 110, 190],
    ['a leftward swipe', 20, 0, 100],
  ])('does not go back for %s', (_, x, endX, endY) => {
    open();
    swipe(screen.getByTestId('surface'), x, endX, endY);
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
  });

  it('does not leave a freshly opened deep link', () => {
    window.history.replaceState({ idx: 0 }, '');
    open();
    swipe();
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
  });

  it('leaves a text box and a sideways scroller alone', () => {
    open();
    swipe(screen.getByRole('textbox', { name: 'Words' }));
    const scroller = screen.getByTestId('surface');
    scroller.style.overflowX = 'auto';
    Object.defineProperties(scroller, {
      scrollWidth: { value: 800 },
      clientWidth: { value: 400 },
    });
    swipe(scroller);
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
  });

  it('does not navigate under an open sheet or photo viewer', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
    swipe();
    expect(screen.getByTestId('path')).toHaveTextContent('/detail');
  });

  it.each(['touchcancel', 'second finger', 'route change'])(
    'forgets a swipe after %s',
    (reason) => {
      open();
      const surface = screen.getByTestId('surface');
      touch('touchstart', surface, [[8, 100]]);
      if (reason === 'second finger')
        touch('touchmove', surface, [
          [40, 100],
          [80, 100],
        ]);
      else if (reason === 'route change')
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      else touch('touchcancel', surface, []);
      touch('touchend', surface, [[110, 100]]);
      expect(screen.getByTestId('path')).toHaveTextContent(
        reason === 'route change' ? '/next' : '/detail',
      );
    },
  );
});
