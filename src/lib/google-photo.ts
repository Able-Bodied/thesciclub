import { useEffect, useState } from 'react';
import { MAX_PHOTO_EDGE } from '@/lib/image';

/**
 * The member's Google profile photo, offered on the photo step and on Your
 * details, and copied into the club only when they choose it (2026-10-22).
 * The browser fetches it straight from Google, which allows any origin; the
 * CSP's connect-src names this one host. The preview is a blob: URL, so
 * img-src needs nothing new.
 */
export const GOOGLE_PHOTO_HOST = 'lh3.googleusercontent.com';

/** Far above any avatar Google serves at this size; the storage cap is lower still. */
export const GOOGLE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface AccountLike {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: { provider: string; identity_data?: Record<string, unknown> | null }[] | null;
}

/**
 * Google's avatar URL at `MAX_PHOTO_EDGE`, or null: not a Google avatar host,
 * or a URL shape whose size cannot be changed. lh4–lh6 serve the same files.
 */
export function largeGooglePhoto(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/^lh\d\.googleusercontent\.com$/.test(url.hostname)) {
    return null;
  }
  url.hostname = GOOGLE_PHOTO_HOST;
  url.search = '';
  url.hash = '';
  const size = `s${MAX_PHOTO_EDGE}-c`;
  if (/=s\d+(-c)?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/=s\d+(-c)?$/, `=${size}`);
  } else if (/\/s\d+(-c)?\//.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/s\d+(-c)?\//, `/${size}/`);
  } else if (url.pathname.startsWith('/a/') && !url.pathname.includes('=')) {
    url.pathname = `${url.pathname}=${size}`;
  }
  return url.toString();
}

/** The account's Google photo, large, or null when it has no Google sign-in or no picture. */
export function googlePhotoUrl(account: AccountLike | null | undefined): string | null {
  if (!account) return null;
  const google = account.identities?.find((identity) => identity.provider === 'google');
  const providers = account.app_metadata?.providers;
  const hasGoogle =
    google !== undefined || (Array.isArray(providers) && providers.includes('google'));
  if (!hasGoogle) return null;
  const candidates = [
    google?.identity_data?.avatar_url,
    google?.identity_data?.picture,
    account.user_metadata?.avatar_url,
    account.user_metadata?.picture,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const large = largeGooglePhoto(candidate);
    if (large) return large;
  }
  return null;
}

/** The photo as a File, as if chosen from the phone, or null on any failure. */
export async function fetchGooglePhoto(url: string, signal?: AbortSignal): Promise<File | null> {
  try {
    if (new URL(url).hostname !== GOOGLE_PHOTO_HOST) return null;
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ?? null,
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    const ext = EXTENSIONS[type];
    if (!ext) return null;
    if (Number(response.headers.get('content-length') ?? 0) > GOOGLE_PHOTO_MAX_BYTES) return null;
    const blob = await response.blob();
    if (blob.size === 0 || blob.size > GOOGLE_PHOTO_MAX_BYTES) return null;
    return new File([blob], `google-photo.${ext}`, { type });
  } catch {
    return null;
  }
}

export interface GooglePhoto {
  file: File;
  /** A blob: URL for the preview, revoked when the screen goes. */
  previewUrl: string;
}

/** Fetches the photo once there is a URL; null until it arrives, or if it never does. */
export function useGooglePhoto(url: string | null): GooglePhoto | null {
  const [photo, setPhoto] = useState<GooglePhoto | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let previewUrl: string | null = null;
    void fetchGooglePhoto(url, controller.signal).then((file) => {
      if (!file || controller.signal.aborted) return;
      previewUrl = URL.createObjectURL(file);
      setPhoto({ file, previewUrl });
    });
    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPhoto(null);
    };
  }, [url]);
  return photo;
}
