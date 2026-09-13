import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Where somebody stands with the club, in one answer.
 *
 * Three states rather than a boolean, because they lead to three different
 * places:
 *
 *  - `signed-out`      — no session. Start at the welcome screen.
 *  - `signed-up`       — verified a number but has no member row yet, because
 *                        they abandoned the wizard partway. Send them back into
 *                        it rather than into an app with no profile behind them.
 *  - `member`          — a row in `members`. Let them in.
 *
 * The membership check reads the viewer's own row through `members`, which is
 * own-row-only by RLS: it returns their row or nothing, and never anybody
 * else's.
 */

export type AccountStatus =
  | 'loading'
  | 'signed-out'
  | 'signed-up'
  | 'member'
  /**
   * A member row exists and is not active.
   *
   * Kept apart from 'member' rather than folded into it, because the app used
   * to fold it in: the row was read without its status, so a suspended member
   * resolved to 'member' and walked into the club. They saw an empty deck and
   * no events — `browse_members` and the event views filter on status — with
   * nothing anywhere saying why. Suspension is the club's reversible sanction
   * and it has to be visible to the person it is applied to.
   */
  | 'suspended';

export interface Account {
  status: AccountStatus;
  userId: string | null;
  /** Read from the member's own row, which RLS already scopes to them. */
  isAdmin: boolean;
  /** Who you are signed in as. Null until the member row is read. */
  displayName: string | null;
}

/**
 * What the member row makes of the person holding it.
 *
 * A pure function because the branch is the whole of suspension: it used to
 * read `row ? 'member' : 'signed-up'`, with the status never selected, so a
 * suspended member became an ordinary one and walked into an empty club.
 *
 * 'removed' sits with 'suspended'. Deletion takes the row out entirely, so a
 * row still saying 'removed' is a membership ended without the row going —
 * not active either way, and owed the same explanation.
 */
export function statusFor(row: { status?: unknown } | null | undefined): AccountStatus {
  if (!row) return 'signed-up';
  return String(row.status) === 'active' ? 'member' : 'suspended';
}

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({
    status: 'loading',
    userId: null,
    isAdmin: false,
    displayName: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const supabase = getSupabase();

    async function resolve(userId: string | null) {
      if (!userId) {
        if (!aborted()) {
          setAccount({ status: 'signed-out', userId: null, isAdmin: false, displayName: null });
        }
        return;
      }
      const result = await supabase
        .from('members')
        .select('id, is_admin, display_name, status')
        .eq('id', userId)
        .maybeSingle();
      if (aborted()) return;
      const row = result.data;
      setAccount({
        status: statusFor(row),
        userId,
        // Coerced rather than passed through: the client types individual
        // selected columns as `any`, and this one decides whether somebody
        // sees the admin tools.
        isAdmin: Boolean(row?.is_admin),
        displayName: row?.display_name ? String(row.display_name) : null,
      });
    }

    void supabase.auth.getSession().then(({ data }) => {
      void resolve(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolve(session?.user.id ?? null);
    });

    return () => {
      controller.abort();
      sub.subscription.unsubscribe();
    };
  }, []);

  return account;
}

/**
 * Sign out.
 *
 * `useAccount` is subscribed to auth changes, so the app reacts on its own:
 * the shell's guard sees a signed-out account and sends the person back to the
 * welcome screen. Nothing here has to navigate.
 */
export async function signOut(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().auth.signOut();
  return error ? { ok: false, error: error.message } : { ok: true };
}
