import { describeError } from '@/lib/describe-error';
import { isNative } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * Passkeys: Face ID, a fingerprint or a security key instead of a password.
 *
 * A Supabase beta, so behind VITE_PASSKEYS (the client is made with the
 * experimental flag in supabase.ts only when it is set) and never offered in
 * a browser that cannot do WebAuthn. A passkey can only be added to an
 * account that already exists: it is offered after onboarding, and on Me.
 */

export interface PasskeyEntry {
  id: string;
  name: string;
  createdAt: string;
}

export type Result = { ok: true } | { ok: false; error: string };

export function passkeysEnabled(): boolean {
  return Boolean(import.meta.env.VITE_PASSKEYS);
}

/** On, and this browser has WebAuthn. */
export function passkeysAvailable(): boolean {
  // The store app's page is not thesciclub.com, which the passkeys belong to.
  if (isNative()) return false;
  return passkeysEnabled() && typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/**
 * Set once a passkey is added or used in this browser. A site cannot ask
 * whether one exists, so the passkey button shows only where one was.
 */
const REMEMBERED_KEY = 'club:passkey-here';

export function passkeyRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBERED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberPasskey(here: boolean): void {
  try {
    if (here) localStorage.setItem(REMEMBERED_KEY, '1');
    else localStorage.removeItem(REMEMBERED_KEY);
  } catch {
    // Private browsing: the email box still offers it where it can.
  }
}

/** Cancelling the browser's own sheet is a choice, not a failure worth a sentence. */
function cancelled(error: { name?: string }): boolean {
  return error.name === 'NotAllowedError' || error.name === 'AbortError';
}

export async function signInWithPasskey(): Promise<Result> {
  if (!passkeysAvailable()) return { ok: false, error: 'This browser cannot use a passkey.' };
  const { error } = await getSupabase().auth.signInWithPasskey();
  if (!error) {
    rememberPasskey(true);
    return { ok: true };
  }
  return {
    ok: false,
    error: cancelled(error) ? '' : describeError(error, 'That passkey did not sign you in.'),
  };
}

/** Whether this browser offers a saved passkey in the email box's suggestions. */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  if (!passkeysAvailable()) return false;
  try {
    // Missing in older browsers, whatever the types say.
    if (!('isConditionalMediationAvailable' in PublicKeyCredential)) return false;
    return await PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

/** Asked again this long before the challenge runs out, so a pick is never stale. */
const AUTOFILL_MARGIN_MS = 15_000;
/** And at least this often, if the server gives no end. */
const AUTOFILL_REFRESH_MS = 4 * 60_000;

function fromBase64url(text: string): ArrayBuffer {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}

function toBase64url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface RequestOptionsJson {
  challenge: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  [key: string]: unknown;
}

function requestOptions(json: RequestOptionsJson): PublicKeyCredentialRequestOptions {
  return {
    ...(json as unknown as PublicKeyCredentialRequestOptions),
    challenge: fromBase64url(json.challenge),
    ...(json.allowCredentials
      ? {
          allowCredentials: json.allowCredentials.map((c) => ({
            ...(c as unknown as PublicKeyCredentialDescriptor),
            id: fromBase64url(c.id),
          })),
        }
      : {}),
  };
}

function responseJson(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: 'public-key' as const,
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
      ...(response.userHandle ? { userHandle: toBase64url(response.userHandle) } : {}),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}

/**
 * Waits for the member to pick a passkey from the email box's suggestions,
 * then signs them in. Resolves once signed in, on a failure, or when
 * `signal` aborts (ok, with no error).
 */
export async function passkeyAutofill(signal: AbortSignal): Promise<Result> {
  const passkey = getSupabase().auth.passkey;
  // A call, so the check is read again after each wait.
  const gone = () => signal.aborted;
  while (!gone()) {
    const { data, error } = await passkey.startAuthentication();
    if (gone()) break;
    if (error) {
      return { ok: false, error: describeError(error, 'Passkeys are not working just now.') };
    }
    const round = new AbortController();
    const stop = () => {
      round.abort();
    };
    signal.addEventListener('abort', stop, { once: true });
    const left = Number.isFinite(data.expires_at)
      ? data.expires_at * 1000 - Date.now() - AUTOFILL_MARGIN_MS
      : AUTOFILL_REFRESH_MS;
    const refresh = setTimeout(stop, Math.max(5_000, Math.min(left, AUTOFILL_REFRESH_MS)));
    let credential: Credential | null = null;
    try {
      credential = await navigator.credentials.get({
        publicKey: requestOptions(data.options as unknown as RequestOptionsJson),
        mediation: 'conditional',
        signal: round.signal,
      });
    } catch (thrown) {
      // Aborted to refresh or to leave; anything else is a real failure.
      const failure = thrown as { name?: string; message?: string };
      if (!round.signal.aborted && !cancelled(failure)) {
        const message = failure.message ?? '';
        return {
          ok: false,
          error: describeError({ ...failure, message }, 'That passkey did not sign you in.'),
        };
      }
    } finally {
      clearTimeout(refresh);
      signal.removeEventListener('abort', stop);
    }
    if (!credential) continue;
    const verified = await passkey.verifyAuthentication({
      challengeId: data.challenge_id,
      credential: responseJson(credential as PublicKeyCredential),
    });
    if (verified.error) {
      return {
        ok: false,
        error: describeError(verified.error, 'That passkey did not sign you in.'),
      };
    }
    rememberPasskey(true);
    return { ok: true };
  }
  return { ok: true };
}

interface CreationOptionsJson {
  challenge: string;
  user: { id: string; [key: string]: unknown };
  excludeCredentials?: { id: string; type: string; transports?: string[] }[];
  [key: string]: unknown;
}

function creationOptions(json: CreationOptionsJson): PublicKeyCredentialCreationOptions {
  return {
    ...(json as unknown as PublicKeyCredentialCreationOptions),
    challenge: fromBase64url(json.challenge),
    user: {
      ...(json.user as unknown as PublicKeyCredentialUserEntity),
      id: fromBase64url(json.user.id),
    },
    ...(json.excludeCredentials
      ? {
          excludeCredentials: json.excludeCredentials.map((c) => ({
            ...(c as unknown as PublicKeyCredentialDescriptor),
            id: fromBase64url(c.id),
          })),
        }
      : {}),
  };
}

function creationJson(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: 'public-key' as const,
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      attestationObject: toBase64url(response.attestationObject),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}

/** Whether the signed-in account has a passkey; null when it could not be read. */
export async function hasPasskey(): Promise<boolean | null> {
  const result = await listPasskeys();
  return result.ok ? result.passkeys.length > 0 : null;
}

/**
 * Lets the browser save a passkey on its own, right after a password its
 * password manager filled (Chrome and Safari's "conditional create"), with
 * only its own small notice. False where it cannot, or did not.
 */
export async function upgradeToPasskeyQuietly(): Promise<boolean> {
  if (!passkeysAvailable()) return false;
  try {
    // Missing in older browsers, whatever the types say.
    if (!('getClientCapabilities' in PublicKeyCredential)) return false;
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    if (capabilities.conditionalCreate !== true) return false;
    const passkey = getSupabase().auth.passkey;
    const { data, error } = await passkey.startRegistration();
    if (error) return false;
    const credential = await navigator.credentials.create({
      publicKey: creationOptions(data.options as unknown as CreationOptionsJson),
      mediation: 'conditional',
    } as CredentialCreationOptions);
    if (!credential) return false;
    const verified = await passkey.verifyRegistration({
      challengeId: data.challenge_id,
      credential: creationJson(credential as PublicKeyCredential),
    });
    if (verified.error) return false;
    rememberPasskey(true);
    return true;
  } catch {
    return false;
  }
}

/** "Not now" on the offer holds for this long, in this browser. */
export const PASSKEY_OFFER_SNOOZE_DAYS = 30;
const OFFER_SNOOZE_KEY = 'club:passkey-offer-snoozed';

export function passkeyOfferSnoozed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(OFFER_SNOOZE_KEY));
    return Number.isFinite(at) && at > 0 && now - at < PASSKEY_OFFER_SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function snoozePasskeyOffer(now = Date.now()): void {
  try {
    localStorage.setItem(OFFER_SNOOZE_KEY, String(now));
  } catch {
    // Private browsing: asked again next time, which is no harm.
  }
}

export async function registerPasskey(): Promise<Result> {
  if (!passkeysAvailable()) return { ok: false, error: 'This browser cannot use a passkey.' };
  const { error } = await getSupabase().auth.registerPasskey();
  if (!error) {
    rememberPasskey(true);
    return { ok: true };
  }
  return {
    ok: false,
    error: cancelled(error) ? '' : describeError(error, 'The passkey was not added.'),
  };
}

function nameOf(friendly: string | undefined): string {
  if (!friendly) return 'Passkey';
  return friendly;
}

export async function listPasskeys(): Promise<
  { ok: true; passkeys: PasskeyEntry[] } | { ok: false; error: string }
> {
  const { data, error } = await getSupabase().auth.passkey.list();
  if (error) return { ok: false, error: describeError(error, 'Could not load your passkeys.') };
  // None left on the account: none to offer here either.
  if (data.length === 0) rememberPasskey(false);
  return {
    ok: true,
    passkeys: data.map((p) => ({
      id: p.id,
      name: nameOf(p.friendly_name),
      createdAt: p.created_at,
    })),
  };
}

export async function deletePasskey(passkeyId: string): Promise<Result> {
  const { error } = await getSupabase().auth.passkey.delete({ passkeyId });
  return error
    ? { ok: false, error: describeError(error, 'The passkey was not removed.') }
    : { ok: true };
}
