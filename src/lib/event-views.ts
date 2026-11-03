import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * How often an event was viewed (the owner, 2026-11-02; 20261103070000): in
 * the app, by members, and on its public page, kept apart. Counts only.
 */

const SEEN_KEY = 'sciclub.eventsViewed';

/** A bigint, which may arrive as text. */
type Count = number | string;

/** Once per event per visit, so a refresh or coming back is not another view. */
function firstThisVisit(key: string): boolean {
  try {
    const seen = new Set<string>(
      JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[],
    );
    if (seen.has(key)) return false;
    seen.add(key);
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    return true;
  } catch {
    return true;
  }
}

export function useRecordEventView(eventId: string | null, isPublic: boolean) {
  useEffect(() => {
    if (!eventId || !firstThisVisit(`${isPublic ? 'public' : 'app'}:${eventId}`)) return;
    void Promise.resolve(
      getSupabase().rpc('record_event_view', { p_event: eventId, p_public: isPublic }),
    ).catch(() => null);
  }, [eventId, isPublic]);
}

/** A tap on the public page's RSVP or Interested, once per visit for each. */
export function recordRsvpClick(eventId: string, going: boolean) {
  if (!firstThisVisit(`${going ? 'rsvp' : 'interested'}:${eventId}`)) return;
  void Promise.resolve(
    getSupabase().rpc('record_event_rsvp_click', { p_event: eventId, p_going: going }),
  ).catch(() => null);
}

export interface EventViewStats {
  /** Members who opened it in the app. */
  members: number;
  /** How many times they did. */
  memberOpens: number;
  /** Opens of the public page. */
  publicOpens: number;
  /** Taps on the public page's RSVP and Interested. */
  rsvpClicks: number;
  interestedClicks: number;
}

export function useEventViewStats(eventId: string, allowed: boolean): EventViewStats | null {
  const [stats, setStats] = useState<EventViewStats | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void Promise.resolve(getSupabase().rpc('event_view_stats', { p_event: eventId }))
      .then((result) => {
        const { data, error } = result as {
          data:
            | {
                members: Count;
                member_opens: Count;
                public_opens: Count;
                rsvp_clicks: Count;
                interested_clicks: Count;
              }[]
            | null;
          error: unknown;
        };
        const row = data?.[0];
        if (cancelled || error || !row) return;
        setStats({
          members: Number(row.members),
          memberOpens: Number(row.member_opens),
          publicOpens: Number(row.public_opens),
          rsvpClicks: Number(row.rsvp_clicks),
          interestedClicks: Number(row.interested_clicks),
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [eventId, allowed]);
  return stats;
}
