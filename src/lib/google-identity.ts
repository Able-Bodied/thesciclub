import { useEffect, useRef, useState } from 'react';

/**
 * Google's own sign-in widget: the button, and the "Sign in as …" prompt,
 * listing the Google accounts already in this browser.
 *
 * The redirect in src/lib/google-sign-in.ts sends a member to Google's full
 * sign-in page, which asks them to type an email (and on the owner's Chrome,
 * 2026-10-07, failed with "Something went wrong" until restarted). This keeps
 * them on the club's page instead: they pick an account, Google hands back a
 * signed ID token, and Supabase signs them in, or links it, with that.
 *
 * The redirect stays as the fallback, for a browser where this script does not
 * load or its window does not come back — the installed iPhone app is the one
 * that has not been tried.
 *
 * ---------------------------------------------------------------------------
 * The nonce
 * ---------------------------------------------------------------------------
 * Google puts the SHA-256 of the nonce it was given into the token; Supabase is
 * handed the nonce itself and checks the two match. That is what stops a token
 * obtained for some other site being replayed here. A new one per widget.
 */

/** The club's OAuth client. Public: it is in every sign-in address. */
export const GOOGLE_CLIENT_ID =
  '897577409345-nc71l72e76am47futhggopvqg6k7fc90.apps.googleusercontent.com';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** How long to wait for Google's script before showing the fallback. */
const LOAD_TIMEOUT_MS = 6000;

interface CredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    context?: 'signin' | 'use';
    auto_select?: boolean;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
    use_fedcm_for_button?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard';
      theme?: 'outline' | 'filled_blue';
      size?: 'large';
      text?: 'signin_with' | 'continue_with';
      shape?: 'rectangular' | 'pill';
      width?: number;
      logo_alignment?: 'left' | 'center';
    },
  ): void;
  prompt(): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let loading: Promise<GoogleAccountsId> | null = null;

/** Loads Google's script once per page. Rejects if it does not arrive. */
export function loadGoogleScript(): Promise<GoogleAccountsId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;

  loading = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    const timer = window.setTimeout(() => {
      reject(new Error('Google did not load.'));
    }, LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('Google did not load.'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Google did not load.'));
    };
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    // Let the next screen try again, rather than every screen failing on one
    // bad moment of signal.
    loading = null;
    throw e;
  });
  return loading;
}

/** A fresh nonce, and the hash Google is given in its place. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return { raw, hashed };
}

export type GoogleButtonState = 'loading' | 'ready' | 'unavailable';

/**
 * Draws Google's button into the returned ref, and calls `onToken` with the ID
 * token and its nonce when somebody picks an account.
 *
 * `prompt` also asks Google for its "Sign in as …" box, which it shows only
 * when it has an account to offer and the person has not dismissed it lately.
 *
 * 'unavailable' is the cue to show the redirect instead.
 */
export function useGoogleButton({
  text,
  prompt = false,
  onToken,
}: {
  text: 'signin_with' | 'continue_with';
  prompt?: boolean;
  onToken: (token: string, nonce: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GoogleButtonState>('loading');
  // Held in a ref so a new callback from the parent does not redraw the button.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    let id: GoogleAccountsId | null = null;

    void (async () => {
      try {
        const [accounts, nonce] = await Promise.all([loadGoogleScript(), makeNonce()]);
        const parent = ref.current;
        if (aborted() || !parent) return;
        id = accounts;
        accounts.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          context: 'signin',
          auto_select: false,
          itp_support: true,
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          cancel_on_tap_outside: true,
          callback: (response) => {
            if (response.credential) onTokenRef.current(response.credential, nonce.raw);
          },
        });
        // Google's widths are pixels, 200 to 400. The box it sits in is the
        // width of the column.
        const width = Math.max(200, Math.min(400, Math.floor(parent.clientWidth || 320)));
        accounts.renderButton(parent, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width,
          logo_alignment: 'center',
        });
        setState('ready');
        if (prompt) accounts.prompt();
      } catch {
        if (!aborted()) setState('unavailable');
      }
    })();

    return () => {
      controller.abort();
      // The prompt belongs to this screen; leaving it should not leave it up.
      id?.cancel();
    };
  }, [text, prompt]);

  return { ref, state };
}
