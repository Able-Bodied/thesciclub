import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapLibreMap } from '@/lib/map';

const spies = vi.hoisted(() => ({ forget: vi.fn(), broke: vi.fn() }));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forgetSignedUrls: spies.forget,
}));
vi.mock('@/lib/shared-reads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  photoBroke: spies.broke,
}));

const { addPhotoBox, forgetPhotoBoxes, PHOTO_PREFIX, setPhotoBoxes } = await import(
  '@/routes/map/peer-photos'
);

const map = {
  hasImage: () => false,
  addImage: vi.fn(),
  updateImage: vi.fn(),
  removeImage: vi.fn(),
} as unknown as MapLibreMap;

afterEach(() => {
  forgetPhotoBoxes();
  vi.unstubAllGlobals();
  spies.forget.mockClear();
  spies.broke.mockClear();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a lone member’s photo box', () => {
  it('signs again and reads again when the file is gone, and tries a new URL once', async () => {
    const fetched = vi.fn(() => Promise.resolve({ ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetched);
    const path = 'm1/profile-old.webp';
    setPhotoBoxes(map, new Map([['m1', { photoPath: path, url: 'https://signed/old' }]]));
    addPhotoBox(map, `${PHOTO_PREFIX}m1`);
    await settle();
    expect(spies.forget).toHaveBeenCalledWith('photos', [path, 'm1/profile-old.thumb.webp']);
    expect(spies.broke).toHaveBeenCalledTimes(1);
    // The same failed URL is not fetched again on the next draw.
    addPhotoBox(map, `${PHOTO_PREFIX}m1`);
    await settle();
    expect(fetched).toHaveBeenCalledTimes(1);
    // Signed again: tried once more.
    setPhotoBoxes(map, new Map([['m1', { photoPath: path, url: 'https://signed/again' }]]));
    await settle();
    expect(fetched).toHaveBeenCalledTimes(2);
  });
});
