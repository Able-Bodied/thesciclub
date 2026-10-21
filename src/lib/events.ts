import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { preparePhoto } from '@/lib/image';
import { PHOTOS_BUCKET } from '@/lib/photos';
import { readInBatches, readPages } from '@/lib/read-pages';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';
import type { ClubEvent, EventAttendee, EventFormat, EventTag, RsvpStatus } from '@/types/domain';
import { memberType } from '@/types/domain';

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

/** The zone a hand-added event's times are typed and read in. */
export const HAND_ADDED_TIMEZONE = 'America/Los_Angeles';

const EVENT_COLUMNS =
  'id, title, description, description_html, start_time, end_time, location, city, url, registration_url, event_format, organization_id, host_name, feed_id, series_id, photo_path, photo_alt, timezone, all_day, state, admin_override, feed_values';

/**
 * A list's columns: what a card, a filter and Home draw, without the
 * description (twice, words and HTML) and the import's bookkeeping, which
 * only the event's own page and its form use. Those read one event by id and
 * still get every column. Most of a list's bytes were descriptions
 * (2026-10-14).
 */
const LIST_COLUMNS =
  'id, title, start_time, end_time, location, city, url, registration_url, event_format, organization_id, host_name, feed_id, series_id, photo_path, photo_alt, timezone, all_day, state';

/**
 * Reads that are the same for every viewer (the tag taxonomy, the calendar
 * feeds' time zones), kept five minutes and shared by every screen that asks,
 * so each Events or Home visit does not read them again. A failed read is not
 * kept.
 */
const SHARED_FOR_MS = 5 * 60_000;
type SharedRead<T> = Promise<{ data: T[] | null; error: Failure | null }>;
const sharedReads = new Map<string, { at: number; read: SharedRead<unknown> }>();

function shared<T>(key: string, read: () => SharedRead<T>): SharedRead<T> {
  const held = sharedReads.get(key);
  if (held && Date.now() - held.at < SHARED_FOR_MS) return held.read as SharedRead<T>;
  const next = read().then((result) => {
    if (result.error) sharedReads.delete(key);
    return result;
  });
  sharedReads.set(key, { at: Date.now(), read: next });
  next.catch(() => {
    sharedReads.delete(key);
  });
  return next;
}

onForgetSharedReads(() => {
  sharedReads.clear();
});

interface EventRow {
  id: string;
  title: string;
  /** Not in a list's read (LIST_COLUMNS). */
  description?: string;
  description_html?: string;
  start_time: string;
  end_time: string | null;
  location: string;
  city: string | null;
  url: string | null;
  registration_url: string | null;
  event_format: string | null;
  organization_id: string | null;
  host_name: string | null;
  /** Null for an event added by hand (20261005020000). */
  feed_id: string | null;
  series_id: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  /** The event's own zone, when its source gave one (20261021000000). */
  timezone: string | null;
  all_day: boolean;
  /** Two letters, in person only (20261021040000). */
  state: string | null;
  /** Imported events an administrator changed (20261012060000). Not in a list's read. */
  admin_override?: Record<string, unknown> | null;
  feed_values?: Record<string, unknown> | null;
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
      description: row.description ?? '',
      descriptionHtml: row.description_html ?? '',
      startTime: row.start_time,
      endTime: row.end_time,
      // A hand-added event has no feed, and is read in Pacific: the form says
      // so, and it is the right answer for every organization the club has,
      // which is also why it stands in for a feed with no row here.
      timezone:
        row.timezone ??
        (row.feed_id ? inputs.timezones.get(row.feed_id) : undefined) ??
        HAND_ADDED_TIMEZONE,
      allDay: row.all_day,
      state: row.state,
      location: row.location,
      city: row.city,
      url: row.url,
      registrationUrl: row.registration_url,
      format: row.event_format as ClubEvent['format'],
      organizationId: row.organization_id,
      hostName: row.host_name,
      handAdded: row.feed_id === null,
      seriesId: row.series_id,
      photoPath: row.photo_path,
      photoAlt: row.photo_alt,
      // The description's HTML moves with its words, so it is not listed apart.
      adminChanged: Object.keys(row.admin_override ?? {}).filter((f) => f !== 'description_html'),
      calendarValues: row.feed_values ?? null,
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
  /** Read again, after a change made on this screen (an administrator's revert). */
  reload?: () => void;
}

/**
 * Every event, with its tags and its public tallies.
 *
 * Date and detail restrictions run on the server. Each read is paged so neither
 * accumulated history nor supporting tags and counts can truncate the result.
 */
export interface EventQuery {
  from?: string;
  to?: string;
  id?: string;
  organizationId?: string;
  /**
   * Only these events (a member's own RSVPs), read a hundred at a time.
   * Null waits: the ids are not known yet. "Been to" read every past event
   * in the club to keep the few the member went to (2026-10-14).
   */
  ids?: readonly string[] | null;
}

export function useEvents({ from, to, id, organizationId, ids }: EventQuery = {}): EventsState {
  // A stable key, so a new array of the same ids does not read again.
  const idsKey = ids === undefined ? undefined : ids === null ? null : [...ids].sort().join(',');
  const [state, setState] = useState<EventsState>({ events: [], loading: true, error: null });
  // Bumped to read again; part of the effect's dependencies for that reason.
  const [round, setRound] = useState(0);
  const reload = useCallback(() => {
    setRound((n) => n + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is the reload trigger.
  useEffect(() => {
    if (idsKey === null) {
      setState({ events: [], loading: true, error: null });
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    // Read through a call, not a property: the type checker narrows
    // `signal.aborted` to false after the first check and then flags every
    // later one as dead code.
    const aborted = () => signal.aborted;
    const only = idsKey === undefined ? null : idsKey === '' ? [] : idsKey.split(',');

    async function load() {
      setState({ events: [], loading: true, error: null });
      try {
        const supabase = getSupabase();
        // Not waiting on the events: neither depends on which were read.
        const taxonomyRead = shared<TagRow>('tags', () =>
          readPages<TagRow>((first, last) =>
            supabase
              .from('tags')
              .select('id, slug, name, parent_id')
              .order('id')
              .range(first, last),
          ),
        );
        const feedsRead = shared<{ id: string; timezone: string }>('data_feeds', () =>
          readPages<{ id: string; timezone: string }>((first, last) =>
            supabase.from('data_feeds').select('id, timezone').order('id').range(first, last),
          ),
        );
        // Typed as the full list: the rows are EventRow either way.
        const columns = (id ? EVENT_COLUMNS : LIST_COLUMNS) as typeof EVENT_COLUMNS;
        const readRange = (batch: string[] | null) =>
          readPages<EventRow>((first, last) => {
            let query = supabase.from('events').select(columns).order('start_time').order('id');
            if (from) query = query.gte('start_time', from);
            if (to) query = query.lte('start_time', to);
            if (id) query = query.eq('id', id);
            if (organizationId) query = query.eq('organization_id', organizationId);
            if (batch) query = query.in('id', batch);
            return query.range(first, last).abortSignal(signal);
          });
        const events = only
          ? await readInBatches<EventRow>(only, readRange).then((result) => ({
              error: result.error,
              data: (result.data ?? []).sort(
                (a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id),
              ),
            }))
          : await readRange(null);
        if (aborted()) return;
        if (events.error) {
          setState({
            events: [],
            loading: false,
            error: describeError(events.error, 'Could not load events.'),
          });
          return;
        }
        const ids = (events.data ?? []).map((event) => event.id);
        // Keep URLs bounded, and fetch tags/counts only for the events just read.
        async function supporting<T>(
          table: string,
          columns: string,
          order: string[],
          map: (rows: unknown[]) => T[],
        ) {
          const batches: string[][] = [];
          for (let offset = 0; offset < ids.length; offset += 100) {
            batches.push(ids.slice(offset, offset + 100));
          }
          // Side by side rather than one after another.
          const results = await Promise.all(
            batches.map((batch) =>
              readPages<T>((first, last) => {
                let query = supabase.from(table).select(columns).in('event_id', batch);
                for (const column of order) query = query.order(column);
                return query
                  .range(first, last)
                  .abortSignal(signal)
                  .overrideTypes<T[], { merge: false }>();
              }),
            ),
          );
          const failed = results.find((result) => result.error);
          if (failed) return failed;
          return { data: results.flatMap((result) => map(result.data ?? [])), error: null };
        }
        const [links, tags, counts, feeds] = await Promise.all([
          supporting<{ event_id: string; tag_id: string }>(
            'event_tags',
            'event_id, tag_id',
            ['event_id', 'tag_id'],
            (rows) => rows as { event_id: string; tag_id: string }[],
          ),
          taxonomyRead,
          supporting<CountRow>(
            'event_rsvp_counts',
            'event_id, going_count, interested_count',
            ['event_id'],
            (rows) => rows as CountRow[],
          ),
          feedsRead,
        ]);
        if (aborted()) return;

        const failure = [events, links, tags, counts, feeds].find((result) => result.error);
        if (failure?.error) {
          setState({
            events: [],
            loading: false,
            error: describeError(failure.error, 'Could not load events.'),
          });
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
          error: describeThrown(e, 'Could not load events.'),
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [from, to, id, organizationId, idsKey, round]);

  return { ...state, reload };
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
          setError(describeError(mine.error, 'Could not load your events.'));
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
        setError(describeThrown(e, 'Could not load your events.'));
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
/** The policy is the membership: a paused member's RSVP is refused, not lost. */
const RSVP_REFUSAL = {
  attempt: 'Your answer was not saved.',
  refused: 'Only an active member can answer.',
  missing: 'That event is not there any more.',
};

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
      return error ? { ok: false, error: describeError(error, RSVP_REFUSAL) } : { ok: true };
    }
    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        { event_id: eventId, member_id: memberId, status },
        { onConflict: 'event_id,member_id' },
      );
    return error ? { ok: false, error: describeError(error, RSVP_REFUSAL) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, RSVP_REFUSAL) };
  }
}

/**
 * What is said once an RSVP is saved (see src/lib/announce.tsx). The buttons
 * change only after the re-read, so without this a screen reader hears the
 * press and then nothing.
 */
export function rsvpSaved(status: RsvpStatus | null): string {
  if (status === 'going') return 'You are going.';
  if (status === 'interested') return 'Marked as interested.';
  return 'Taken back.';
}

/* ------------------------------------------------------ added by hand */

/** What the event form hands to `save_event`; the database checks all of it again. */
export interface EventDraftPayload {
  /** Null to add a new event. */
  id: string | null;
  organizationId: string | null;
  /** Who hosts it when no organization does. Ignored by the database when one does. */
  hostName: string;
  title: string;
  description: string;
  /** ISO, already converted from the Pacific wall-clock time typed. */
  startTime: string;
  endTime: string | null;
  format: EventFormat;
  location: string;
  city: string;
  url: string;
  registrationUrl: string;
}

const SAVE_EVENT_REFUSAL = {
  attempt: 'The event was not saved.',
  refused: 'You cannot add or change this event.',
  missing: 'That event is not on the calendar any more.',
};

/** Adds or changes a hand-added event, through `save_event` (20261005020000). Resolves to its id. */
export async function saveEvent(
  draft: EventDraftPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('save_event', {
      event: draft.id,
      organization: draft.organizationId,
      host: draft.hostName,
      title: draft.title,
      description: draft.description,
      starts: draft.startTime,
      ends: draft.endTime,
      format: draft.format,
      place: draft.location,
      city: draft.city,
      link: draft.url,
      registration: draft.registrationUrl,
    })) as { data: string | null; error: Failure | null };
    if (error || !data) {
      return { ok: false, error: describeError(error ?? { message: '' }, SAVE_EVENT_REFUSAL) };
    }
    return { ok: true, id: data };
  } catch (e) {
    return { ok: false, error: describeThrown(e, SAVE_EVENT_REFUSAL) };
  }
}

/** How a new event repeats (20261011050000). Null ends: it never does. */
export interface RepeatRule {
  unit: 'day' | 'week' | 'month';
  /** Every this many days, weeks or months; 1 to 30. */
  every: number;
  /** The last day it may fall on, as YYYY-MM-DD in Pacific. */
  endsOn: string | null;
  /** How many dates in all, the first included; 2 to 100. */
  endsAfter: number | null;
}

/**
 * Adds a repeating event through `save_event_series`: the first date is saved
 * by save_event, with all its checks, and the dates up to three months ahead
 * are made from it. Resolves to the first date's id.
 */
export async function saveEventSeries(
  draft: Omit<EventDraftPayload, 'id'>,
  repeat: RepeatRule,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('save_event_series', {
      organization: draft.organizationId,
      host: draft.hostName,
      title: draft.title,
      description: draft.description,
      starts: draft.startTime,
      ends: draft.endTime,
      format: draft.format,
      place: draft.location,
      city: draft.city,
      link: draft.url,
      registration: draft.registrationUrl,
      repeat_unit: repeat.unit,
      repeat_every: repeat.every,
      ends_on: repeat.endsOn,
      ends_after: repeat.endsAfter,
    })) as { data: string | null; error: Failure | null };
    if (error || !data) {
      return { ok: false, error: describeError(error ?? { message: '' }, SAVE_EVENT_REFUSAL) };
    }
    return { ok: true, id: data };
  } catch (e) {
    return { ok: false, error: describeThrown(e, SAVE_EVENT_REFUSAL) };
  }
}

/**
 * Deletes this date of a repeating event and every later one, and the series
 * makes no more (`delete_event_and_later`).
 */
export async function deleteEventAndLater(eventId: string): Promise<WriteResult> {
  const refusal = {
    attempt: 'The dates were not deleted.',
    refused: 'You cannot delete this event.',
    missing: 'That event is not on the calendar any more.',
  };
  try {
    const { error } = await getSupabase().rpc('delete_event_and_later', { event: eventId });
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, refusal) };
  }
}

/** The long edge a cover is kept at: the event page draws it full width, at most 720 CSS px. */
const COVER_EDGE = 1600;
const COVER_REFUSAL = {
  attempt: 'The picture was not saved.',
  refused: 'You cannot change this event.',
  missing: 'That event is not on the calendar any more.',
};

/**
 * What to do with an event's cover picture when it is saved: keep it, put a
 * new one in, or take it off. `alt` is what a screen reader says for it.
 */
export type CoverChange =
  | { kind: 'keep'; path: string | null; alt: string }
  | { kind: 'new'; file: File; alt: string }
  | { kind: 'remove' };

/**
 * Gives an event a cover picture, or none (20261011070000). On a date of a
 * repeating event it applies to that date and every later one.
 *
 * Upload, then point the row at it, then delete the file it replaced — the
 * logo's order (lib/organization-management.ts), for the same reason. The
 * database hands back a file to delete only when no date still shows it.
 * Shrunk and re-encoded first, which also drops the location and camera
 * details a phone writes into a photograph (lib/image.ts).
 */
export async function saveEventCover(
  eventId: string,
  change: CoverChange,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  try {
    let path: string | null = null;
    let alt: string | null = null;
    if (change.kind === 'new') {
      const { blob, ext } = await preparePhoto(change.file, COVER_EDGE, '#ffffff');
      path = `events/${eventId}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, blob, { upsert: false, contentType: blob.type });
      if (upload.error) return { ok: false, error: describeError(upload.error, COVER_REFUSAL) };
      alt = change.alt;
    } else if (change.kind === 'keep') {
      path = change.path;
      alt = change.alt;
    }
    const { data, error } = (await supabase.rpc('set_event_photo', {
      event: eventId,
      photo_path: path,
      photo_alt: alt,
    })) as { data: string | null; error: Failure | null };
    if (error) {
      if (change.kind === 'new' && path) await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
      return { ok: false, error: describeError(error, COVER_REFUSAL) };
    }
    if (data && data !== path) {
      // Its failure is not reported: the event's picture is saved either way.
      await supabase.storage.from(PHOTOS_BUCKET).remove([data]);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, COVER_REFUSAL) };
  }
}

/**
 * An administrator's change to an imported event (20261012060000): only the
 * fields that differ from the organization's calendar are kept as changes,
 * and they survive the nightly import until reverted.
 */
export async function adminChangeImportedEvent(
  eventId: string,
  draft: Omit<EventDraftPayload, 'id'>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { error } = await getSupabase().rpc('admin_change_imported_event', {
      event: eventId,
      organization: draft.organizationId,
      host: draft.hostName,
      title: draft.title,
      description: draft.description,
      starts: draft.startTime,
      ends: draft.endTime,
      format: draft.format,
      place: draft.location,
      city: draft.city,
      link: draft.url,
      registration: draft.registrationUrl,
    });
    if (error) return { ok: false, error: describeError(error, SAVE_EVENT_REFUSAL) };
    return { ok: true, id: eventId };
  } catch (e) {
    return { ok: false, error: describeThrown(e, SAVE_EVENT_REFUSAL) };
  }
}

/** Puts an imported event back as its organization's calendar has it. */
export async function revertImportedEvent(eventId: string): Promise<WriteResult> {
  const refusal = {
    attempt: 'The event was not reverted.',
    refused: 'Only an administrator can change an imported event.',
    missing: 'That event is not on the calendar any more.',
  };
  try {
    const { error } = await getSupabase().rpc('admin_revert_imported_event', { event: eventId });
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, refusal) };
  }
}

/** Deletes a hand-added event, with its RSVPs. Its group chat stays. */
export async function deleteEvent(eventId: string): Promise<WriteResult> {
  const refusal = {
    attempt: 'The event was not deleted.',
    refused: 'You cannot delete this event.',
    missing: 'That event is not on the calendar any more.',
  };
  try {
    const { error } = await getSupabase().rpc('delete_event', { event: eventId });
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, refusal) };
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
  /** Optional: absent from a database before 20261015000000. */
  injury_type?: string | null;
  condition_name?: string | null;
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
    injuryType: (row.injury_type ?? null) as EventAttendee['injuryType'],
    conditionName: row.condition_name ?? null,
    type: memberType(row.type),
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
            'member_id, status, display_name, photo_path, photo_alt, avatar_color, city, level_range, exact_level, injury_type, condition_name, type',
          )
          .eq('event_id', eventId)
          .order('display_name')
          .abortSignal(signal);
        if (aborted()) return;
        if (error) {
          setState({
            attendees: [],
            loading: false,
            error: describeError(error, 'Could not load who is going.'),
          });
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
          error: describeThrown(e, 'Could not load who is going.'),
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
const ATTENDEE_COLUMNS =
  'event_id, member_id, status, display_name, photo_path, photo_alt, avatar_color, city, level_range, exact_level, injury_type, condition_name, type';

/**
 * `eventIds` narrows the read to the events on the screen. Without it this
 * read every RSVP ever made (2026-10-14), which only grows: the import never
 * removes a past event. Ids are sent a hundred at a time, as the tag and
 * count reads are, to keep each URL bounded. `null` waits: the events are not
 * known yet.
 */
export function useAttendeesByEvent(
  eventIds?: readonly string[] | null,
  /**
   * Instead of ids: every event starting in this window, filtered through the
   * view's link to `events`, so the read need not wait for the events to know
   * their ids (Home reads both at once).
   */
  window?: { from?: string; to?: string },
): AttendeesByEventState {
  const [state, setState] = useState<AttendeesByEventState>({
    byEvent: new Map(),
    loading: true,
    error: null,
  });
  // A stable key, so a new array holding the same ids does not read again.
  const key = window
    ? `window|${window.from ?? ''}|${window.to ?? ''}`
    : eventIds === undefined
      ? '*'
      : eventIds === null
        ? null
        : [...eventIds].sort().join(',');

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;
    const [kind, start, end] = key.split('|');
    const inWindow = kind === 'window' ? { start, end } : null;
    const ids = inWindow || key === '*' ? null : key === '' ? [] : key.split(',');
    // Another set of events: say so, so a screen waiting on the faces waits.
    setState((current) => (current.loading ? current : { ...current, loading: true }));

    async function load() {
      try {
        const supabase = getSupabase();
        const read = (batch: string[] | null) => {
          if (inWindow) {
            // Paged, with a full order: a busy month can pass 1,000 RSVPs.
            return readPages<AttendeeRow & { event_id: string }>((first, last) => {
              let query = supabase
                .from('event_attendees')
                .select(`${ATTENDEE_COLUMNS}, events!event_rsvps_event_id_fkey!inner(start_time)`);
              if (inWindow.start) query = query.gte('events.start_time', inWindow.start);
              if (inWindow.end) query = query.lte('events.start_time', inWindow.end);
              return query
                .order('display_name')
                .order('member_id')
                .order('event_id')
                .range(first, last)
                .abortSignal(signal);
            });
          }
          let query = supabase.from('event_attendees').select(ATTENDEE_COLUMNS);
          if (batch) query = query.in('event_id', batch);
          return query.order('display_name').abortSignal(signal);
        };
        const batches: (string[] | null)[] = [];
        if (ids === null) batches.push(null);
        else for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
        const results = await Promise.all(batches.map(read));
        const error = results.find((result) => result.error)?.error ?? null;
        const data = results.flatMap((result) => result.data ?? []);
        if (aborted()) return;
        if (error) {
          setState({
            byEvent: new Map(),
            loading: false,
            error: describeError(error, 'Could not load who is going.'),
          });
          return;
        }

        const byEvent = new Map<string, EventAttendee[]>();
        // Each batch comes back in name order. An event's rows are all in one
        // batch, so every event's list is already in order.
        const rows = data as (AttendeeRow & { event_id: string })[];
        for (const row of rows) {
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
          error: describeThrown(e, 'Could not load who is going.'),
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [key]);

  return state;
}
