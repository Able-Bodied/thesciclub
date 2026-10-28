import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyWhenReady, shareLink } from '@/lib/share-link';

const LINK = { url: 'https://thesciclub.com/join?from=abc', title: 'The SCI Club', text: 'Hi' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubNavigator(share: unknown, writeText: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { share, clipboard: { writeText } });
}

describe('sharing a link', () => {
  it("uses the phone's share sheet when there is one", async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator(share, writeText);
    expect(await shareLink(LINK)).toBe('shared');
    expect(share).toHaveBeenCalledWith(LINK);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('takes closing the sheet as a choice, and copies nothing', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator(() => Promise.reject(new DOMException('closed', 'AbortError')), writeText);
    expect(await shareLink(LINK)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the address where there is no share sheet, or it fails', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator(undefined, writeText);
    expect(await shareLink(LINK)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(LINK.url);
    stubNavigator(() => Promise.reject(new Error('not allowed')), writeText);
    expect(await shareLink(LINK)).toBe('copied');
  });

  it('says so when it can neither share nor copy', async () => {
    stubNavigator(undefined, () => Promise.reject(new Error('denied')));
    expect(await shareLink(LINK)).toBe('failed');
  });
});

describe('copyWhenReady (the owner, 2026-10-28)', () => {
  it('writes the link once it is made, where the clipboard takes only text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    expect(await copyWhenReady(Promise.resolve('https://x/join?from=a'))).toEqual({
      url: 'https://x/join?from=a',
      copied: true,
    });
    expect(writeText).toHaveBeenCalledWith('https://x/join?from=a');
  });

  it('copies nothing when no link was made, and says when the clipboard refuses', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    expect(await copyWhenReady(Promise.resolve(null))).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    expect(await copyWhenReady(Promise.resolve('https://x/join?from=b'))).toEqual({
      url: 'https://x/join?from=b',
      copied: false,
    });
  });
});
