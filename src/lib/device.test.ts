import { afterEach, describe, expect, it, vi } from 'vitest';
import { missingFunction, viewDevice } from '@/lib/device';

function browser(userAgent: string, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints: 0, ...extra });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('viewDevice', () => {
  it('takes the browser’s own answer first', () => {
    browser('Mozilla/5.0 (X11; Linux x86_64)', { userAgentData: { mobile: true } });
    expect(viewDevice()).toBe('mobile');
    browser('Mozilla/5.0 (Linux; Android 14) Mobile', { userAgentData: { mobile: false } });
    expect(viewDevice()).toBe('desktop');
  });

  it('reads a phone from its user agent', () => {
    browser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148');
    expect(viewDevice()).toBe('mobile');
  });

  it('counts an iPad asking for the desktop site as mobile', () => {
    browser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', { maxTouchPoints: 5 });
    expect(viewDevice()).toBe('mobile');
  });

  it('counts a Mac as desktop', () => {
    browser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(viewDevice()).toBe('desktop');
  });
});

describe('missingFunction', () => {
  it('is only PostgREST’s no-such-function answer', () => {
    expect(missingFunction({ code: 'PGRST202' })).toBe(true);
    expect(missingFunction({ code: '42501' })).toBe(false);
    expect(missingFunction(null)).toBe(false);
  });
});
