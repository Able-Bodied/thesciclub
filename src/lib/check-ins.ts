import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Checking in to an event (the owner, 2026-10-30; 20261030000000).
 *
 * In the app, from the event's page, or by a printed QR code, which is only
 * the address of /events/:id/check-in. The database holds the window and says
 * no outside it; this mirrors it, so the button is only lit when it would work
 * (the owner, 2026-10-31: "an hour before and after the event"; 20261031040000).
 * An organization's event makes whoever checks in a member of that
 * organization.
 */

const HOUR = 3_600_000;
/** How long before it opens an event's page shows the button, unlit. */
const UNLIT_FOR = 24 * HOUR;
/** The longest a timer can wait. */
const LONGEST_WAIT = 2 ** 31 - 1;

interface WhenItIs {
  startTime: string;
  endTime: string | null;
  allDay: boolean;
}

/** As check_in_to_event: an hour before the start to an hour after the end. */
export function checkInWindow(event: WhenItIs): { opens: number; closes: number } {
  const start = Date.parse(event.startTime);
  const end = event.endTime ? Date.parse(event.endTime) : null;
  return {
    opens: start - HOUR,
    closes: event.allDay ? (end ?? start) + 24 * HOUR : (end ?? start + 4 * HOUR) + HOUR,
  };
}

export function checkInOpen(event: WhenItIs, now: number = Date.now()): boolean {
  const { opens, closes } = checkInWindow(event);
  return now >= opens && now <= closes;
}

export type CheckInPhase = 'far' | 'soon' | 'open' | 'over';

/** Where an event is: soon is the day before it opens, when the button shows unlit. */
export function checkInPhase(event: WhenItIs, now: number = Date.now()): CheckInPhase {
  const { opens, closes } = checkInWindow(event);
  if (now > closes) return 'over';
  if (now >= opens) return 'open';
  return now >= opens - UNLIT_FOR ? 'soon' : 'far';
}

/** The phase, moving on by itself, so a page left open lights up by itself. */
export function useCheckInPhase(event: WhenItIs | null | undefined): CheckInPhase | null {
  const [, setTick] = useState(0);
  const phase = event ? checkInPhase(event) : null;
  const startTime = event?.startTime;
  const endTime = event?.endTime;
  const allDay = event?.allDay;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the phase and the event's times are what it waits on.
  useEffect(() => {
    if (!event || phase === null || phase === 'over') return;
    const { opens, closes } = checkInWindow(event);
    const next = phase === 'far' ? opens - UNLIT_FOR : phase === 'soon' ? opens : closes + 1;
    const timer = window.setTimeout(
      () => {
        setTick((n) => n + 1);
      },
      Math.min(Math.max(next - Date.now(), 0), LONGEST_WAIT),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase, startTime, endTime, allDay]);

  return phase;
}

/** What the printed code opens. */
export function checkInUrl(eventId: string): string {
  return `https://thesciclub.com/events/${eventId}/check-in`;
}

/** Whether this member has checked in, and the way to do it. */
export function useMyCheckIn(eventId: string, memberId: string | null) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    let live = true;
    void Promise.resolve(
      getSupabase()
        .from('event_check_ins')
        .select('event_id')
        .eq('event_id', eventId)
        .eq('member_id', memberId)
        .maybeSingle(),
    ).then(
      ({ data }) => {
        if (live) setCheckedIn(data !== null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [eventId, memberId]);

  const checkIn = useCallback(async () => {
    const refusal = 'You were not checked in. Try again.';
    setBusy(true);
    setError(null);
    try {
      const { data, error: failure } = (await getSupabase().rpc('check_in_to_event', {
        p_event: eventId,
      })) as { data: string | null; error: Failure | null };
      if (failure) {
        setError(describeError(failure, refusal));
        return;
      }
      setCheckedIn(true);
      setJoined(data);
    } catch (thrown) {
      setError(describeThrown(thrown, refusal));
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  return { checkedIn, joined, busy, error, checkIn };
}

export interface CheckedInMember {
  id: string;
  displayName: string;
  username: string | null;
  photoPath: string | null;
  photoAlt: string | null;
  checkedInAt: string;
}

interface CheckedInRow {
  member_id: string;
  display_name: string;
  username: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  checked_in_at: string;
}

/** For the event's organizers; the database gives anybody else nothing. */
export async function fetchCheckIns(
  eventId: string,
): Promise<{ ok: true; value: CheckedInMember[] } | { ok: false; error: string }> {
  const refusal = 'Could not load who checked in.';
  try {
    const { data, error } = (await getSupabase().rpc('event_check_in_list', {
      p_event: eventId,
    })) as { data: CheckedInRow[] | null; error: Failure | null };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.member_id,
        displayName: row.display_name,
        username: row.username,
        photoPath: row.photo_path,
        photoAlt: row.photo_alt,
        checkedInAt: row.checked_in_at,
      })),
    };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}
