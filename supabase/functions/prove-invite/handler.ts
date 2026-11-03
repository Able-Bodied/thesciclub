/**
 * The rules of prove-invite, with every outside thing passed in so the rules
 * can be tested.
 */

import { proofEmail } from './compose.ts';

export interface Deps {
  /** The signed-in caller's id for this bearer token, or null. */
  callerId(jwt: string): Promise<string | null>;
  /** True when a code should be emailed (start_invite_proof). */
  start(account: string, email: string, codeHash: string): Promise<boolean>;
  /** True when the code was right and the invite is theirs (finish_invite_proof). */
  finish(account: string, codeHash: string): Promise<boolean>;
  sendEmail(to: string, email: { subject: string; text: string; html: string }): Promise<boolean>;
  /** Six random digits. */
  newCode(): string;
  now(): number;
  wait(ms: number): Promise<void>;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * No answer comes sooner than this. Sending an email takes time, so without it
 * how long the answer took would say whether the address is on the list.
 */
export const SLOWEST_SEND_MS = 2_000;

const CODE = /^\d{6}$/;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Salted with the account, so a code's hash means nothing for any other. */
function hashOf(account: string, code: string): Promise<string> {
  return sha256Hex(`${account}:${code}`);
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^\S+@\S+\.\S+$/.test(value.trim());
}

export async function proveInvite(
  bearer: string | null,
  payload: unknown,
  deps: Deps,
): Promise<Reply> {
  const jwt = bearer?.replace(/^Bearer\s+/i, '').trim();
  const caller = jwt ? await deps.callerId(jwt) : null;
  if (!caller) return { status: 401, body: { error: 'Sign in first.' } };

  const { email, code } = (payload ?? {}) as { email?: unknown; code?: unknown };

  if (typeof code === 'string' && CODE.test(code)) {
    return { status: 200, body: { proved: await deps.finish(caller, await hashOf(caller, code)) } };
  }

  if (!looksLikeEmail(email)) return { status: 400, body: { error: 'An address or a code.' } };

  // The same answer, in the same time, whether or not this address is on the
  // list, and whether or not the email went: a failure is ours to read.
  const started = deps.now();
  const address = email.trim();
  const fresh = deps.newCode();
  if (await deps.start(caller, address, await hashOf(caller, fresh))) {
    await deps.sendEmail(address, proofEmail(fresh));
  }
  await deps.wait(Math.max(0, SLOWEST_SEND_MS - (deps.now() - started)));
  return { status: 200, body: { sent: true } };
}
