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

export type AccountStatus = 'loading' | 'signed-out' | 'signed-up' | 'member';

export interface Account {
  status: AccountStatus;
  userId: string | null;
  /** Read from the member's own row, which RLS already scopes to them. */
  isAdmin: boolean;
}

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({
    status: 'loading',
    userId: null,
    isAdmin: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const supabase = getSupabase();

    async function resolve(userId: string | null) {
      if (!userId) {
        if (!aborted()) setAccount({ status: 'signed-out', userId: null, isAdmin: false });
        return;
      }
      const result = await supabase
        .from('members')
        .select('id, is_admin')
        .eq('id', userId)
        .maybeSingle();
      if (aborted()) return;
      const row = result.data;
      setAccount({
        status: row ? 'member' : 'signed-up',
        userId,
        // Coerced rather than passed through: the client types individual
        // selected columns as `any`, and this one decides whether somebody
        // sees the admin tools.
        isAdmin: Boolean(row?.is_admin),
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
