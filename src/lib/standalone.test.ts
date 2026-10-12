import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStandalone } from '@/lib/standalone';

function displayModeIs(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: standalone && query.includes('standalone') })),
  );
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'standalone');
  vi.unstubAllGlobals();
});

describe('isStandalone', () => {
  it('on an iPhone, believes Safari: a tab is a tab even when display-mode says standalone', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    displayModeIs(true);
    expect(isStandalone()).toBe(false);
  });

  it('on an iPhone, the Home Screen app is standalone whatever display-mode says', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    displayModeIs(false);
    expect(isStandalone()).toBe(true);
  });

  it('elsewhere, follows display-mode', () => {
    displayModeIs(true);
    expect(isStandalone()).toBe(true);
    displayModeIs(false);
    expect(isStandalone()).toBe(false);
  });
});
