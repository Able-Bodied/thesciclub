/**
 * The rules of invite-signup (the owner, 2026-11-01): a sign-up with nothing to
 * wait for.
 *
 *   - An invite link: it was emailed to them, so they are trusted, with whatever
 *     address they join with.
 *   - A live organization's or partner's code: these are people at an event, who
 *     have no time to go to their email and back. Nothing proves the address
 *     here, a choice made for that reason.
 *
 * Neither is used for an address with a pending invite of its own, or somebody
 * could take that person's place.
 *
 * Anything else answers `created: false`, with no reason given, and the page
 * goes on to the ordinary sign-up and its code. That sign-up says what needs
 * saying, and this says nothing about whether an address has an account.
 */

export const MIN_PASSWORD = 8;

export interface Deps {
  /** The address the token's invite was sent to; null for any token not usable. */
  inviteAddress(token: string): Promise<string | null>;
  /** Whether a code is live and lets people in, not only gives credit. */
  codeAdmits(code: string): Promise<boolean>;
  /** Whether a pending invite is waiting for this address. */
  invited(address: string): Promise<boolean>;
  /** Makes the account, confirmed. False if it was refused for any reason. */
  createConfirmedUser(
    email: string,
    password: string,
    metadata: Record<string, string>,
  ): Promise<boolean>;
}

export async function inviteSignup(body: unknown, deps: Deps): Promise<{ created: boolean }> {
  const { email, password, token, code } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return { created: false };
  const address = email.trim().toLowerCase();
  if (!address || password.length < MIN_PASSWORD) return { created: false };

  if (typeof token === 'string' && token.trim()) {
    const sentTo = (await deps.inviteAddress(token))?.toLowerCase();
    if (sentTo && (sentTo === address || !(await deps.invited(address)))) {
      return {
        created: await deps.createConfirmedUser(address, password, { invite_token: token }),
      };
    }
  }

  if (typeof code === 'string' && code.trim()) {
    if ((await deps.codeAdmits(code)) && !(await deps.invited(address))) {
      return { created: await deps.createConfirmedUser(address, password, { qr_code: code }) };
    }
  }
  return { created: false };
}
