import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { ClubEvent, EventAttendee, EventTag, RsvpStatus } from '@/types/domain';

/**
 * Reading and writing events.
 *
 * Rows are snake_case from Postgres and camelCase in the app, so the mapping
 * happens once, here, rather than in every component — the same arrangement as
 * src/lib/members.ts.
 *
 * ---------------------------------------------------------------------------
 * Why this issues four small queries instead of one embedded one
 * ---------------------------------------------------------------------------
 * An event's tags live two joins away (event_tags -> tags -> its parent tag),
 * and its counts come from a grouped view that has no foreign key for PostgREST
 * to follow. Expressing that as one nested `select` means a self-referential
 * embed named after a constraint, which breaks silently and invisibly if the
 * constraint is ever renamed — the row simply arrives with no tags on it.
 *
 * So the pieces are fetched separately and joined in memory. The taxonomy is
 * about thirty rows and effectively static, the counts are one small row per
 * event with an RSVP, and the four requests go out together. The join is a few
 * lines of ordinary code that a test can reach.
 *
 * ---------------------------------------------------------------------------
 * `select *` is not available on events
 * ---------------------------------------------------------------------------
 * The column privilege on latitude/longitude is revoked for both browser roles
 * (20260911180000_events.sql), which makes `select *` fail rather than silently
 * omit them. Every query here names its columns. That is the intended cost.
 */

const EVENT_COLUMNS =
  'id, title, description, description_html, start_time, end_time, location, city, url, registration_url, event_format, organization_id, host_name, feed_id';

interface EventRow {
  id: string;
  title: string;
  description: string;
  description_html: string;
  start_time: string;
  end_time: string | null;
  location: string;
  city: string | null;
  url: string | null;
  registration_url: string | null;
  event_format: string | null;
  organization_id: string | null;
  host_name: string | null;
  feed_id: string;
}

interface TagRow {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

interface CountRow {
  event_id: string;
  going_count: number;
  interested_count: number;
}

/** A tag id -> the resolved tag, with its category flattened onto it. */
export type Taxonomy = Map<string, EventTag>;

/** Build the lookup the row mapper needs from the flat tag table. */
export function buildTaxonomy(rows: TagRow[]): Taxonomy {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const taxonomy: Taxonomy = new Map();
  for (const row of rows) {
    // Categories are the roots of the tree and are never applied to an event
    // themselves; only their children are.
    if (!row.parent_id) continue;
    const parent = byId.get(row.parent_id);
    taxonomy.set(row.id, {
      slug: row.slug,
      name: row.name,
      // A tag whose parent is missing would be a broken foreign key, which the
      // schema forbids. Falling back to the tag's own identity keeps a chip
      // rendering rather than crashing the list if it ever happens.
      categorySlug: parent?.slug ?? row.slug,
      categoryName: parent?.name ?? row.name,
    });
  }
  return taxonomy;
}

export interface EventJoinInputs {
  events: EventRow[];
  eventTags: { event_id: string; tag_id: string }[];
  taxonomy: Taxonomy;
  counts: CountRow[];
  /** Feed id -> IANA zone, so each event is formatted in its own. */
  timezones: Map<string, string>;
}

/**
 * The one row -> domain mapping. Exported so nothing writes a second one, and
 * so the join can be tested without a database.
 */
export function toEvents(inputs: EventJoinInputs): ClubEvent[] {
  const tagsByEvent = new Map<string, EventTag[]>();
  for (const link of inputs.eventTags) {
    const tag = inputs.taxonomy.get(link.tag_id);
    if (!tag) continue;
    const existing = tagsByEvent.get(link.event_id);
    if (existing) existing.push(tag);
    else tagsByEvent.set(link.event_id, [tag]);
  }

  const countsByEvent = new Map(inputs.counts.map((row) => [row.event_id, row]));

  return inputs.events.map((row) => {
    const counts = countsByEvent.get(row.id);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      descriptionHtml: row.description_html,
      startTime: row.start_time,
      endTime: row.end_time,
      // A feed with no row here cannot happen (feed_id is NOT NULL and
      // references data_feeds), but Pacific is the right answer for every
      // organization the club has, so guessing it beats rendering nothing.
      timezone: inputs.timezones.get(row.feed_id) ?? 'America/Los_Angeles',
      location: row.location,
      city: row.city,
      url: row.url,
      registrationUrl: row.registration_url,
      format: row.event_format as ClubEvent['format'],
      organizationId: row.organization_id,
      hostName: row.host_name,
      // Sorted so a card's chips do not reshuffle between renders.
      tags: (tagsByEvent.get(row.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      // An event nobody has RSVPed to has no row in the counts view rather
      // than a row of zeroes. See the view's own header.
      goingCount: counts?.going_count ?? 0,
      interestedCount: counts?.interested_count ?? 0,
    };
  });
}

export interface EventsState {
  events: ClubEvent[];
  loading: boolean;
  /** The database's own sentence where there is one, not a rewritten summary. */
  error: string | null;
}

/**
 * Every event, with its tags and its public tallies.
 *
 * Deliberately unfiltered and unpaged: src/routes/events/filters.ts narrows the
 * result in memory, and its header says why and when that stops being right.
 */
export function useEvents(): EventsState {
  const [state, setState] = useState<EventsState>({ events: [], loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // Read through a call, not a property: the type checker narrows
    // `signal.aborted` to false after the first check and then flags every
    // later one as dead code.
    const aborted = () => signal.aborted;

    async function load() {
      try {
        const supabase = getSupabase();
        const [events, links, tags, counts, feeds] = await Promise.all([
          supabase.from('events').select(EVENT_COLUMNS).order('start_time').abortSignal(signal),
          supabase.from('event_tags').select('event_id, tag_id').abortSignal(signal),
          supabase.from('tags').select('id, slug, name, parent_id').abortSignal(signal),
          supabase
            .from('event_rsvp_counts')
            .select('event_id, going_count, interested_count')
            .abortSignal(signal),
          supabase.from('data_feeds').select('id, timezone').abortSignal(signal),
        ]);
        if (aborted()) return;

        const failure = [events, links, tags, counts, feeds].find((result) => result.error);
        if (failure?.error) {
          setState({ events: [], loading: false, error: failure.error.message });
          return;
        }

        setState({
          events: toEvents({
            events: events.data ?? [],
            eventTags: links.data ?? [],
            taxonomy: buildTaxonomy(tags.data ?? []),
            counts: counts.data ?? [],
            timezones: new Map(
              ((feeds.data ?? []) as { id: string; timezone: string }[]).map((f) => [
                f.id,
                f.timezone,
              ]),
            ),
          }),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (aborted()) return;
        setState({
          events: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load events.',
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------ viewer state */

export interface ViewerState {
  rsvps: Map<string, RsvpStatus>;
  /**
   * Event id -> that event's start time, for the RSVPs above.
   *
   * Embedded in the same query rather than fetched separately, so a screen that
   * needs to tell an RSVP that is still ahead from one that is behind — Me's
   * counters — can do it without loading the whole calendar to find two dates.
   */
  startTimes: Map<string, string>;
  loading: boolean;
  error: string | null;
  /** Re-read after a write, so a second tab or a failed mutation cannot drift. */
  reload: () => void;
}

/** One row of the RSVP query, with the event's date embedded. */
interface RsvpRow {
  event_id: string;
  status: RsvpStatus;
  /**
   * PostgREST returns an object for this embed, because an RSVP belongs to
   * exactly one event — but the generated client types it as an array, the way
   * it types every embed. Both shapes are accepted here rather than asserted
   * away, so a change at either end surfaces as a missing date instead of as
   * `undefined.start_time` at runtime.
   */
  events: { start_time: string } | { start_time: string }[] | null;
}

/** The embedded event's start time, whichever shape it arrived in. */
function embeddedStartTime(row: RsvpRow): string | null {
  const embedded = Array.isArray(row.events) ? row.events[0] : row.events;
  return embedded?.start_time ?? null;
}

/**
 * What the signed-in member has already said about events.
 *
 * Both tables are own-row-only, so these queries need no `where` on member_id:
 * RLS is already the filter. Writing one anyway would suggest the policy is
 * advisory.
 */
export function useViewerEvents(memberId: string | null): ViewerState {
  const [rsvps, setRsvps] = useState<Map<string, RsvpStatus>>(new Map());
  const [startTimes, setStartTimes] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The loader is a callback rather than an effect body so that `reload` can
  // run the same code after a write. A refetch counter in the dependency array
  // would do the same thing while reading as a dependency the effect does not
  // actually use.
  const load = useCallback(
    async (signal: AbortSignal) => {
      const aborted = () => signal.aborted;
      if (!memberId) {
        setRsvps(new Map());
        setStartTimes(new Map());
        setLoading(false);
        return;
      }
      try {
        const supabase = getSupabase();
        const mine = await supabase
          .from('event_rsvps')
          .select('event_id, status, events(start_time)')
          .abortSignal(signal);
        if (aborted()) return;
        if (mine.error) {
          setError(mine.error.message);
          setLoading(false);
          return;
        }

        const rows = mine.data as unknown as RsvpRow[];
        setRsvps(new Map(rows.map((row) => [row.event_id, row.status])));
        // A row whose event has gone is dropped rather than carried with a null
        // date: an RSVP to an event that no longer exists is not something a
        // counter should claim the member has coming up.
        const dated = rows.flatMap((row) => {
          const startTime = embeddedStartTime(row);
          return startTime ? [[row.event_id, startTime] as const] : [];
        });
        setStartTimes(new Map(dated));
        setError(null);
        setLoading(false);
      } catch (e) {
        if (aborted()) return;
        setError(e instanceof Error ? e.message : 'Could not load your events.');
        setLoading(false);
      }
    },
    [memberId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load(new AbortController().signal);
  }, [load]);

  return { rsvps, startTimes, loading, error, reload };
}

/* --------------------------------------------------------------- mutations */

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/**
 * Say Interested, say Going, or take it back.
 *
 * `status: null` deletes the row rather than storing a third state. "I am not
 * going" and "I have not said" are the same fact to everybody else, and a row
 * that recorded the difference would have to be excluded from every count.
 *
 * The upsert conflict target is (event_id, member_id), which is the table's own
 * unique constraint: changing your mind is an update of one row, never a second
 * row that the counts would then double.
 */
export async function setRsvp(
  eventId: string,
  memberId: string,
  status: RsvpStatus | null,
): Promise<WriteResult> {
  try {
    const supabase = getSupabase();
    if (status === null) {
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', eventId)
        .eq('member_id', memberId);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        { event_id: eventId, member_id: memberId, status },
        { onConflict: 'event_id,member_id' },
      );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save that.' };
  }
}

/* ------------------------------------------------------------- attendees */

interface AttendeeRow {
  member_id: string;
  status: RsvpStatus;
  display_name: string;
  photo_path: string | null;
  photo_alt: string | null;
  avatar_color: string | null;
  city: string | null;
  level_range: string;
  exact_level: string | null;
  type: string;
}

export function toAttendee(row: AttendeeRow): EventAttendee {
  return {
    memberId: row.member_id,
    status: row.status,
    displayName: row.display_name,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
    avatarColor: row.avatar_color,
    city: row.city,
    levelRange: row.level_range,
    exactLevel: row.exact_level,
    type: row.type === 'mentor' ? 'mentor' : 'peer',
  };
}

export interface AttendeesState {
  attendees: EventAttendee[];
  loading: boolean;
  error: string | null;
}

/**
 * Who is going, for one event.
 *
 * Reads `event_attendees`, which is granted to `authenticated` only and yields
 * nothing unless the viewer is themselves an active member. A member who opted
 * out of being browsed is counted by `ClubEvent.goingCount` but has no row
 * here, so the list can legitimately be shorter than the tally.
 */
export function useEventAttendees(eventId: string | undefined): AttendeesState {
  const [state, setState] = useState<AttendeesState>({
    attendees: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!eventId) {
      setState({ attendees: [], loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;

    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('event_attendees')
          .select(
            'member_id, status, display_name, photo_path, photo_alt, avatar_color, city, level_range, exact_level, type',
          )
          .eq('event_id', eventId)
          .order('display_name')
          .abortSignal(signal);
        if (aborted()) return;
        if (error) {
          setState({ attendees: [], loading: false, error: error.message });
          return;
        }
        setState({
          attendees: (data as AttendeeRow[]).map(toAttendee),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (aborted()) return;
        setState({
          attendees: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load who is going.',
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [eventId]);

  return state;
}

export interface AttendeesByEventState {
  /** Event id -> the members going or interested, as this viewer may see them. */
  byEvent: Map<string, EventAttendee[]>;
  loading: boolean;
  error: string | null;
}

/**
 * Every attendee the viewer is allowed to see, for the whole list at once.
 *
 * The card shows two overlapping avatars and "Nicole and Jake are going", so
 * the list needs attendees for every event on it, not one event at a time —
 * a request per card would be a request per card.
 *
 * This is small in practice: `event_attendees` only has rows for members who
 * have actually RSVPed, and the view already refuses everything unless the
 * viewer is an active member, so a signed-out or suspended caller gets an empty
 * map rather than an error to render.
 */
export function useAttendeesByEvent(): AttendeesByEventState {
  const [state, setState] = useState<AttendeesByEventState>({
    byEvent: new Map(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;

    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('event_attendees')
          .select(
            'event_id, member_id, status, display_name, photo_path, photo_alt, avatar_color, city, level_range, exact_level, type',
          )
          .order('display_name')
          .abortSignal(signal);
        if (aborted()) return;
        if (error) {
          setState({ byEvent: new Map(), loading: false, error: error.message });
          return;
        }

        const byEvent = new Map<string, EventAttendee[]>();
        for (const row of data as (AttendeeRow & { event_id: string })[]) {
          const attendee = toAttendee(row);
          const existing = byEvent.get(row.event_id);
          if (existing) existing.push(attendee);
          else byEvent.set(row.event_id, [attendee]);
        }
        setState({ byEvent, loading: false, error: null });
      } catch (e) {
        if (aborted()) return;
        setState({
          byEvent: new Map(),
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load who is going.',
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
