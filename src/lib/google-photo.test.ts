import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGooglePhoto,
  GOOGLE_PHOTO_MAX_BYTES,
  googlePhotoUrl,
  largeGooglePhoto,
} from '@/lib/google-photo';

const AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocKabc=s96-c';
const LARGE = 'https://lh3.googleusercontent.com/a/ACg8ocKabc=s800-c';

describe('largeGooglePhoto', () => {
  it('asks Google for the size the club stores', () => {
    expect(largeGooglePhoto(AVATAR)).toBe(LARGE);
    expect(largeGooglePhoto('https://lh3.googleusercontent.com/a/ACg8ocKabc=s96')).toBe(LARGE);
    expect(largeGooglePhoto('https://lh3.googleusercontent.com/a/ACg8ocKabc')).toBe(LARGE);
    expect(largeGooglePhoto('https://lh5.googleusercontent.com/-x/AAAA/s96-c/photo.jpg')).toBe(
      'https://lh3.googleusercontent.com/-x/AAAA/s800-c/photo.jpg',
    );
  });

  it('refuses anything but a Google avatar host over https', () => {
    expect(largeGooglePhoto('http://lh3.googleusercontent.com/a/x=s96-c')).toBeNull();
    expect(largeGooglePhoto('https://evil.example/a/x=s96-c')).toBeNull();
    expect(largeGooglePhoto('https://lh3.googleusercontent.com.evil.example/a/x')).toBeNull();
    expect(largeGooglePhoto('https://appleid.cdn-apple.com/x.jpg')).toBeNull();
    expect(largeGooglePhoto('not a url')).toBeNull();
  });
});

describe('googlePhotoUrl', () => {
  it("reads the Google identity's picture", () => {
    expect(
      googlePhotoUrl({
        identities: [{ provider: 'google', identity_data: { avatar_url: AVATAR } }],
      }),
    ).toBe(LARGE);
  });

  it('falls back to the account metadata when the account signed in with Google', () => {
    expect(
      googlePhotoUrl({
        app_metadata: { providers: ['google'] },
        user_metadata: { picture: AVATAR },
      }),
    ).toBe(LARGE);
  });

  it('offers nothing to an Apple or email account', () => {
    expect(
      googlePhotoUrl({
        identities: [{ provider: 'apple', identity_data: { avatar_url: AVATAR } }],
        app_metadata: { providers: ['apple'] },
        user_metadata: { avatar_url: AVATAR },
      }),
    ).toBeNull();
    expect(googlePhotoUrl({ identities: [{ provider: 'email' }] })).toBeNull();
    expect(googlePhotoUrl(null)).toBeNull();
  });

  it('offers nothing when Google gave no picture', () => {
    expect(googlePhotoUrl({ identities: [{ provider: 'google', identity_data: {} }] })).toBeNull();
  });
});

describe('fetchGooglePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(body: BodyInit, headers: Record<string, string>, status = 200) {
    const fetch = vi.fn(() => Promise.resolve(new Response(body, { status, headers })));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('hands back the photo as a file, fetched without cookies or referrer', async () => {
    const fetch = serve(new Uint8Array([1, 2, 3]), { 'content-type': 'image/jpeg' });
    const file = await fetchGooglePhoto(LARGE);
    expect(file?.name).toBe('google-photo.jpg');
    expect(file?.type).toBe('image/jpeg');
    expect(file?.size).toBe(3);
    expect(fetch).toHaveBeenCalledWith(
      LARGE,
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
    );
  });

  it('fetches from no other host', async () => {
    const fetch = serve(new Uint8Array([1]), { 'content-type': 'image/jpeg' });
    expect(await fetchGooglePhoto('https://lh4.googleusercontent.com/a/x')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses what is not a photo, too large, or an error', async () => {
    serve('<html>', { 'content-type': 'text/html' });
    expect(await fetchGooglePhoto(LARGE)).toBeNull();
    serve(new Uint8Array(GOOGLE_PHOTO_MAX_BYTES + 1), { 'content-type': 'image/png' });
    expect(await fetchGooglePhoto(LARGE)).toBeNull();
    serve(new Uint8Array([1]), { 'content-type': 'image/png' }, 404);
    expect(await fetchGooglePhoto(LARGE)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchGooglePhoto(LARGE)).toBeNull();
  });
});
