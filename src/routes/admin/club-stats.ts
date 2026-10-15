import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * How the club is being used, for Admin → Stats (20261015020000).
 *
 * In place of Google Analytics (the owner, 2026-10-13): counts of rows the club
 * already keeps, read by an administrator, sent nowhere. Counts only, never who.
 */

/** All time first: the default (the owner, 2026-10-15). */
export const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: 'prev24h', label: 'Previous 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'prev7d', label: 'Previous 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'prev30d', label: 'Previous 30 days' },
] as const;

export type StatsPeriod = (typeof PERIODS)[number]['value'];

/** "in the last 7 days", or "ever" for all time. */
export function periodPhrase(period: StatsPeriod): string {
  const label = PERIODS.find((p) => p.value === period)?.label ?? '';
  return period === 'all' ? 'ever' : `in the ${label.toLowerCase()}`;
}

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

export interface ProfileCounts {
  username: number;
  birthday: number;
  /** The kind, an exact level, or a range other than "Not sure yet". */
  injury: number;
  /** A city or a state. */
  location: number;
  phone: number;
  photo: number;
  notifications: number;
}

export interface ClubStats {
  asOf: string;
  period: StatsPeriod;
  /** Active members now, whatever the period. */
  members: number;
  /** Members made in the period. */
  joined: number;
  /**
   * Members who opened the app since the period began. Null for a previous
   * period: a session keeps only when it was last used. For all time, the
   * members who have ever signed in.
   */
  opened: number | null;
  /** Of the accounts made in the period: all of them… */
  accounts: number;
  /** …those that signed in, and so started onboarding… */
  signedIn: number;
  /** …those that became members, which is reaching Home… */
  reachedHome: number;
  /** …and those members with notifications on now. */
  notificationsOn: number;
  /**
   * Of those who reached Home, how many have each part of a profile. What
   * finished members added, not where anybody stopped: onboarding keeps
   * nothing until its last step.
   */
  profile: ProfileCounts;
  questions: number;
  replies: number;
  messages: number;
  rsvps: number;
  /** Members who asked, replied, messaged or RSVPed in the period. */
  active: number;
  /** Oldest first, eight of them, ending with this week, whatever the period. */
  weeks: StatsWeek[];
}

export async function fetchClubStats(
  period: StatsPeriod,
): Promise<{ ok: true; stats: ClubStats } | { ok: false; error: string }> {
  const { data, error } = (await getSupabase().rpc('admin_club_stats', { period })) as {
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

export function useClubStats(period: StatsPeriod) {
  const [stats, setStats] = useState<ClubStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchClubStats(period);
    if (result.ok) {
      setStats(result.stats);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [period]);

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
