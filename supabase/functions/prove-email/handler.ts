/**
 * The rules of prove-email, with every outside thing passed in so the rules
 * can be tested.
 */

import { confirmEmail } from './compose.ts';

export interface Deps {
  /** The signed-in caller's id for this bearer token, or null. */
  callerId(jwt: string): Promise<string | null>;
  /** The address to email the code to, or null to send none (start_email_proof). */
  start(account: string, codeHash: string): Promise<string | null>;
  /** True when the code was right (finish_email_proof). */
  finish(account: string, codeHash: string): Promise<boolean>;
  sendEmail(to: string, email: { subject: string; text: string; html: string }): Promise<boolean>;
  /** Six random digits. */
  newCode(): string;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const CODE = /^\d{6}$/;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Salted with the account, so a code's hash means nothing for any other. */
function hashOf(account: string, code: string): Promise<string> {
  return sha256Hex(`${account}:${code}`);
}

/**
 * `{ send: true }` emails a code to the caller's own address while it is
 * unproven, answering `{ sent }`: false while one went in the last minute,
 * after five in an hour, or with nothing to confirm. `{ code }` answers
 * `{ proved }`.
 */
export async function proveEmail(
  bearer: string | null,
  payload: unknown,
  deps: Deps,
): Promise<Reply> {
  const jwt = bearer?.replace(/^Bearer\s+/i, '').trim();
  const caller = jwt ? await deps.callerId(jwt) : null;
  if (!caller) return { status: 401, body: { error: 'Sign in first.' } };

  const { send, code } = (payload ?? {}) as { send?: unknown; code?: unknown };

  if (typeof code === 'string' && CODE.test(code.trim())) {
    return {
      status: 200,
      body: { proved: await deps.finish(caller, await hashOf(caller, code.trim())) },
    };
  }
  if (send !== true) return { status: 400, body: { error: 'Send, or a code.' } };

  const fresh = deps.newCode();
  const address = await deps.start(caller, await hashOf(caller, fresh));
  if (!address) return { status: 200, body: { sent: false } };
  return { status: 200, body: { sent: await deps.sendEmail(address, confirmEmail(fresh)) } };
}
