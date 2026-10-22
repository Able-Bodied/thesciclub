/**
 * The rules of apple-revoke: each queued token is revoked with Apple as the
 * client that issued it. Accepted, or already invalid at Apple (the member
 * revoked it themselves), the row goes; anything else keeps its error for
 * the next try. Nothing here can stop an account being deleted: that has
 * already happened.
 */

import { type AppleAnswer, type AppleClient, appleError, isAppleClient } from '../_shared/apple.ts';

export interface DueRow {
  id: number;
  client_id: string;
  refresh_token: string;
}

export interface Deps {
  /** Claims what is due (apple_revocations_due). */
  due(): Promise<DueRow[] | null>;
  /** POSTs to Apple's revoke endpoint, with client_id and client_secret added. */
  revoke(client: AppleClient, token: string): Promise<AppleAnswer>;
  /** Null error: done, the row goes. */
  done(id: number, error: string | null): Promise<void>;
  log(message: string): void;
}

export async function revokeDue(
  deps: Deps,
): Promise<{ status: number; body: Record<string, number | string> }> {
  const rows = await deps.due();
  if (!rows) return { status: 502, body: { error: 'could not read the queue' } };
  let revoked = 0;
  let failed = 0;
  for (const row of rows) {
    if (!isAppleClient(row.client_id)) {
      await deps.done(row.id, `unknown client ${row.client_id}`);
      failed += 1;
      continue;
    }
    const answer = await deps.revoke(row.client_id, row.refresh_token);
    if (answer.status === 200 || answer.body.error === 'invalid_grant') {
      await deps.done(row.id, null);
      revoked += 1;
    } else {
      const error = appleError(answer);
      deps.log(`apple-revoke: Apple refused ${row.client_id} revocation ${row.id}: ${error}`);
      await deps.done(row.id, error);
      failed += 1;
    }
  }
  return { status: 200, body: { revoked, failed } };
}
