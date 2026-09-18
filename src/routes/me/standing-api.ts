import { getSupabase } from '@/lib/supabase';

/**
 * A strike as the member it belongs to sees it.
 *
 * An administrator reads the same rows through `admin_strikes`, which carries
 * who issued it; a member is not shown that, because the club warned them, not
 * a person.
 *
 * ---------------------------------------------------------------------------
 * The member id is passed in, and the filter is not optional
 * ---------------------------------------------------------------------------
 * `member_strikes` carries two select policies — a member reads their own, and
 * an administrator reads every one — and Postgres ORs them. So an unfiltered
 * select returns their own rows to an ordinary member and *the whole club's* to
 * an administrator, who then reads somebody else's strike on their own Standing
 * card. That is not hypothetical: the card said "Two strikes" to an
 * administrator holding one, the first time this ran against real rows.
 *
 * The policy is right and stays. The lesson is the one already in HANDOFF.md
 * under "A view's own security check can break a caller who is not its
 * audience", in its mirror image: a policy written to be generous to one
 * audience is not a filter for another. Where a screen means "mine", it has to
 * say so.
 */
export interface MyStrike {
  id: string;
  reason: string;
  issuedAt: string;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
}

interface MyStrikeRow {
  id: string;
  reason: string;
  issued_at: string;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
}

export async function loadMyStrikes(
  memberId: string,
): Promise<{ ok: true; strikes: MyStrike[] } | { ok: false; error: string }> {
  const result = await getSupabase()
    .from('member_strikes')
    .select('id, reason, issued_at, withdrawn_at, withdrawn_reason')
    .eq('member_id', memberId)
    .order('issued_at', { ascending: false });
  if (result.error) return { ok: false, error: result.error.message };
  return {
    ok: true,
    strikes: (result.data as MyStrikeRow[]).map((row) => ({
      id: row.id,
      reason: row.reason,
      issuedAt: row.issued_at,
      withdrawnAt: row.withdrawn_at,
      withdrawnReason: row.withdrawn_reason,
    })),
  };
}

/** How long a strike counts for. Mirrors `strike_window()` in the database. */
export const STRIKE_MONTHS = 12;

/**
 * How many strikes a membership survives. Mirrors `strike_limit()`.
 *
 * The database refuses a fourth — see 20260917000000 — so this is not the
 * client's own rule about when to stop offering the button. It is the same
 * number said on this side, so the card can read "one more" at two without
 * counting to three by hand.
 */
export const STRIKE_LIMIT = 3;

/**
 * Whether a strike still counts towards three.
 *
 * The same two conditions `active_strike_count()` applies, restated here
 * because the member's card has the rows in hand and asking the database to
 * count them again would be a round trip to learn something already on screen.
 * If one changes, both change — that is what the shared constant is for.
 */
export function stillCounts(strike: MyStrike, now: Date = new Date()): boolean {
  if (strike.withdrawnAt) return false;
  const expires = new Date(strike.issuedAt);
  expires.setMonth(expires.getMonth() + STRIKE_MONTHS);
  return expires > now;
}

export function countingStrikes(strikes: MyStrike[], now: Date = new Date()): MyStrike[] {
  return strikes.filter((strike) => stillCounts(strike, now));
}
