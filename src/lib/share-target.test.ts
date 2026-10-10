import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARE_META, sharedBody, sharedTitle, shareFileKey, takeShared } from '@/lib/share-target';

describe('the topic made from a share', () => {
  it('takes the shared title first, then the first line, then the link', () => {
    expect(sharedTitle({ title: 'A ramp', text: 'words', url: 'https://x.example' })).toBe(
      'A ramp',
    );
    expect(sharedTitle({ title: ' ', text: '\nFirst line\nSecond', url: '' })).toBe('First line');
    expect(sharedTitle({ title: '', text: '', url: 'https://x.example/a' })).toBe(
      'https://x.example/a',
    );
    expect(sharedTitle({ title: 'x'.repeat(200), text: '', url: '' })).toHaveLength(140);
  });

  it('puts the link under the words, once', () => {
    expect(sharedBody({ text: 'Look at this', url: 'https://x.example' })).toBe(
      'Look at this\nhttps://x.example',
    );
    expect(sharedBody({ text: 'Look https://x.example', url: 'https://x.example' })).toBe(
      'Look https://x.example',
    );
    expect(sharedBody({ text: '', url: 'https://x.example' })).toBe('https://x.example');
  });
});

describe('reading what was shared', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeCaches(entries: Map<string, Response>) {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      open: () =>
        Promise.resolve({ match: (key: string) => Promise.resolve(entries.get(key)?.clone()) }),
      delete: (name: string) => {
        deleted.push(name);
        entries.clear();
        return Promise.resolve(true);
      },
    });
    return deleted;
  }

  it('returns the words and photographs, and empties the cache so it is read once', async () => {
    const entries = new Map<string, Response>([
      [SHARE_META, new Response(JSON.stringify({ title: 'T', text: 'W', url: '', files: 1 }))],
      [
        shareFileKey(0),
        new Response(new Blob(['x'], { type: 'image/png' }), {
          headers: {
            'Content-Type': 'image/png',
            'x-file-name': encodeURIComponent('my photo.png'),
          },
        }),
      ],
    ]);
    const deleted = fakeCaches(entries);
    const shared = await takeShared();
    expect(shared?.title).toBe('T');
    expect(shared?.files.map((f) => [f.name, f.type])).toEqual([['my photo.png', 'image/png']]);
    expect(deleted).toEqual(['club-share']);
    expect(await takeShared()).toBeNull();
  });
});
