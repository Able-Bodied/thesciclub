import { useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * What Apple has told the club about members' Apple accounts (Sign in with
 * Apple's server-to-server notices, 20261022170000), for an administrator on
 * the Sign-in tab. Nothing in the club changes by itself: these say who may
 * need another way in, or no longer gets the club's emails. First, when
 * revoking deleted accounts' Apple sign-ins was given up (20261022160000).
 */

export type AppleNoticeKind =
  | 'consent-revoked'
  | 'account-delete'
  | 'email-disabled'
  | 'email-enabled'
  | 'revoke-abandoned';

export interface AppleNotice {
  kind: AppleNoticeKind;
  receivedAt: string;
  /** Null for 'revoke-abandoned', whose accounts are gone. */
  memberId: string | null;
  displayName: string | null;
  /** 'revoke-abandoned' only: how many, and Apple's last answer. */
  howMany: number | null;
  detail: string | null;
}

export function noticeSentence({ kind, displayName: name, howMany, detail }: AppleNotice): string {
  const displayName = name ?? 'A member';
  switch (kind) {
    case 'revoke-abandoned': {
      const count = howMany === 1 ? 'one deleted account' : `${howMany ?? 0} deleted accounts`;
      return `Apple was not told to end Sign in with Apple for ${count}, after seven tries${
        detail ? ` (${detail})` : ''
      }. Whoever runs the club’s Supabase project should check the apple-revoke function.`;
    }
    case 'consent-revoked':
      return `${displayName} stopped using Sign in with Apple for the club. If Apple was their only way in, they need another.`;
    case 'account-delete':
      return `${displayName} deleted their Apple Account. Their club account is still here; if Apple was their only way in, they need another.`;
    case 'email-disabled':
      return `${displayName}’s Hide My Email address stopped forwarding, so the club’s emails no longer reach them.`;
    case 'email-enabled':
      return `${displayName}’s Hide My Email address forwards again.`;
  }
}

export async function loadAppleNotices(): Promise<
  { ok: true; notices: AppleNotice[] } | { ok: false; error: string }
> {
  // Taken whole: rpc() types its data as `any`.
  const result = await getSupabase().rpc('admin_apple_notices');
  if (result.error) {
    return { ok: false, error: describeError(result.error, 'Could not read Apple’s notices.') };
  }
  const rows = ((result.data as unknown) ?? []) as {
    kind: AppleNoticeKind;
    received_at: string;
    member_id: string | null;
    display_name: string | null;
    how_many?: number | null;
    detail?: string | null;
  }[];
  return {
    ok: true,
    notices: rows.map((row) => ({
      kind: row.kind,
      receivedAt: row.received_at,
      memberId: row.member_id,
      displayName: row.display_name,
      howMany: row.how_many ?? null,
      detail: row.detail ?? null,
    })),
  };
}

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Los_Angeles',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

export function AppleNotices() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; notices: AppleNotice[] }
    | { status: 'error'; error: string }
  >({ status: 'loading' });

  useEffect(() => {
    let live = true;
    void loadAppleNotices()
      .catch(() => ({ ok: false as const, error: 'Could not read Apple’s notices.' }))
      .then((result) => {
        if (!live) return;
        setState(
          result.ok
            ? { status: 'ready', notices: result.notices }
            : { status: 'error', error: result.error },
        );
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section
      aria-labelledby="apple-notices-heading"
      className="rounded-[14px] border border-line bg-paper p-3.5"
    >
      <h2 id="apple-notices-heading" className="font-bold font-head text-[0.9375rem] text-ink">
        From Apple
      </h2>
      {state.status === 'loading' ? (
        <p className="mt-1.5 text-[0.8125rem] text-grey">Checking…</p>
      ) : state.status === 'error' ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {state.error}
        </p>
      ) : state.notices.length === 0 ? (
        <p className="mt-1.5 text-[0.8125rem] text-ink2 leading-[1.5]">
          Nothing yet. Apple says here when a member stops using Sign in with Apple, deletes their
          Apple Account, or their Hide My Email address stops forwarding.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {state.notices.map((notice) => (
            <li
              key={`${notice.memberId ?? ''}-${notice.kind}-${notice.receivedAt}`}
              className="text-[0.8125rem] text-ink leading-[1.5]"
            >
              <span className="block text-grey">
                {new Date(notice.receivedAt).toLocaleDateString('en-US', SHORT_DATE)}
              </span>
              {noticeSentence(notice)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
