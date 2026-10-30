import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce } from '@/lib/coalesce';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('coalesce', () => {
  it('runs the first call at once', () => {
    const fn = vi.fn();
    coalesce(fn, 1500)();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('makes a burst one more run, after the last call', () => {
    const fn = vi.fn();
    const call = coalesce(fn, 1500);
    call();
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(100);
      call();
    }
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(499);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs once more for a call that lands just before the pending run', () => {
    const fn = vi.fn();
    const call = coalesce(fn, 1500);
    call();
    vi.advanceTimersByTime(1499);
    call();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    // Right after a run, the next call waits its turn rather than being lost.
    call();
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('runs at once again after a quiet spell', () => {
    const fn = vi.fn();
    const call = coalesce(fn, 1500);
    call();
    vi.advanceTimersByTime(1500);
    call();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs nothing after cancel', () => {
    const fn = vi.fn();
    const call = coalesce(fn, 1500);
    call();
    call();
    call.cancel();
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
