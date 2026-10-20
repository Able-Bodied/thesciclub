import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GIVE_BACK_AFTER_MS, useBackFromRedirect } from '@/lib/back-from-redirect';

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup() {
  const onBack = vi.fn();
  const { result, unmount } = renderHook(() => useBackFromRedirect(onBack));
  return { onBack, leave: result.current, unmount };
}

describe('useBackFromRedirect', () => {
  it('does nothing until the page has left', () => {
    const { onBack } = setup();
    act(() => {
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(GIVE_BACK_AFTER_MS);
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it('gives the button back when the page is visible again, once', () => {
    const { onBack, leave } = setup();
    act(leave);
    visibility = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onBack).not.toHaveBeenCalled();
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(GIVE_BACK_AFTER_MS);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('gives it back when focused, or shown again from the back-forward cache', () => {
    const { onBack, leave } = setup();
    act(leave);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    act(leave);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('gives it back after ten seconds if nothing says the page is back', () => {
    const { onBack, leave } = setup();
    act(leave);
    act(() => {
      vi.advanceTimersByTime(GIVE_BACK_AFTER_MS - 1);
    });
    expect(onBack).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the screen goes', () => {
    const { onBack, leave, unmount } = setup();
    act(leave);
    unmount();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(GIVE_BACK_AFTER_MS);
    expect(onBack).not.toHaveBeenCalled();
  });
});
