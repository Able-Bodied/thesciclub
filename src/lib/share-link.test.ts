import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareLink } from '@/lib/share-link';

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
