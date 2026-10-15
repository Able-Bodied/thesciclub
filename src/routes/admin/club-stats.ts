import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * How the club is being used, for Admin → Stats (20261015020000).
 *
 * In place of Google Analytics (the owner, 2026-10-13): counts of rows the club
 * already keeps, read by an administrator, sent nowhere. Counts only, never who.
 */

export interface StatsWeek {
  /** The Monday the week starts on, in California, as an ISO date. */
  week: string;
  joined: number;
  questions: number;
  replies: number;
  messages: number;
  rsvps: number;
  /** Members who asked, replied, messaged or said they were going. */
  people: number;
}

export interface ClubStats {
  asOf: string;
  members: number;
  joined7: number;
  joined30: number;
  withBio: number;
  opened1: number;
  opened7: number;
  opened30: number;
  invited: number;
  invitedWithAccount: number;
  invitedJoined: number;
  /** Oldest first, eight of them, ending with this week. */
  weeks: StatsWeek[];
}

export async function fetchClubStats(): Promise<
  { ok: true; stats: ClubStats } | { ok: false; error: string }
> {
  const { data, error } = (await getSupabase().rpc('admin_club_stats')) as {
    data: ClubStats | null;
    error: Parameters<typeof describeError>[0] | null;
  };
  if (error || !data)
    return {
      ok: false,
      error: error
        ? describeError(error, 'Could not load the stats.')
        : 'Could not load the stats.',
    };
  return { ok: true, stats: data };
}

export function useClubStats() {
  const [stats, setStats] = useState<ClubStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchClubStats();
    if (result.ok) {
      setStats(result.stats);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, error, loading, reload: load };
}

/** "Oct 6", for a week's Monday. */
export function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}
