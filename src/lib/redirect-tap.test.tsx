import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TAP_AGAIN_AFTER_MS, useRedirectTap } from '@/lib/redirect-tap';

describe('useRedirectTap', () => {
  it('lets the first tap go, holds a second straight after, and lets one go later', () => {
    let now = 1_000_000;
    const { result } = renderHook(() => useRedirectTap(() => now));
    expect(result.current()).toBe(true);
    now += TAP_AGAIN_AFTER_MS - 1;
    expect(result.current()).toBe(false);
    now += 1;
    expect(result.current()).toBe(true);
  });

  it('needs nothing to happen between taps: no timer, no event', () => {
    let now = 0;
    const { result } = renderHook(() => useRedirectTap(() => now));
    expect(result.current()).toBe(true);
    // Hours later, with the page frozen behind Apple's the whole time.
    now += 3 * 60 * 60_000;
    expect(result.current()).toBe(true);
  });
});
