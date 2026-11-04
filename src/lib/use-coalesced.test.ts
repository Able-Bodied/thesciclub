import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoalesced } from '@/lib/use-coalesced';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCoalesced', () => {
  it('runs once at once, then once 1.5 s later for a burst', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useCoalesced(fn));
    act(() => {
      for (let i = 0; i < 20; i += 1) result.current();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs the latest callback, and keeps one identity across renders', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useCoalesced(fn), {
      initialProps: { fn: first },
    });
    const call = result.current;
    act(() => {
      call();
      call();
    });
    rerender({ fn: second });
    expect(result.current).toBe(call);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('drops a pending run when the screen closes', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useCoalesced(fn));
    act(() => {
      result.current();
      result.current();
    });
    unmount();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
