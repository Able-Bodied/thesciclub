import { Plus, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { rsvpSaved, setRsvp, useAttendeesByEvent, useEvents, useViewerEvents } from '@/lib/events';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { EventCard } from '@/routes/events/event-card';
import { mayAddEvents } from '@/routes/events/event-draft';
import { EventFilterSheet } from '@/routes/events/filter-sheet';
import {
  activeFilterCount,
  citiesIn,
  dateWindowRange,
  filterEvents,
  formatsIn,
  isPastEvent,
  isRsvpSegment,
  organizationIdsIn,
  tagsIn,
} from '@/routes/events/filters';
import { OrganizationList } from '@/routes/events/organization-list';
import { SeriesFooter } from '@/routes/events/series-card';
import { groupBySeries } from '@/routes/events/series-groups';
import {
  type ClubEvent,
  EMPTY_EVENT_FILTERS,
  EVENTS_SEGMENTS,
  type EventFilters,
  type EventsSegment,
  type RsvpStatus,
} from '@/types/domain';

/**
 * Events — what there is to go to, from the partner organizations' own
 * calendars.
 *
 * ---------------------------------------------------------------------------
 * Why this is a column and not the full shell
 * ---------------------------------------------------------------------------
 * Peers grids its cards into the shell's full width, because a deck is
 * something you scan. A calendar is something you read down: one event after
 * another in date order, and the order is the content. Stretched to 1100px
 * every card's title, chips, host and buttons sit at wildly different x
 * positions, so following the list means sweeping the eye — and every RSVP
 * means dragging the pointer — right across the screen.
 *
 * That cost is not evenly shared. A member with a cervical injury may be
 * driving this with a head pointer, a mouth stick or a trackball, where
 * distance is effort rather than a flick of the wrist. So the column is capped
 * at a comfortable reading measure: wider than the phone, nowhere near the
 * window, and the same shape on every screen.
 *
 * Most events here were published by somebody else and ingested
 * (jobs/event-ingest). From 2026-10-05 an administrator, or a member who
 * speaks for an organization, can also add one by hand, and only they are
 * shown "Add an event" (event-form.tsx).
 *
 * The segments are the mock's, from `evPage()`. Organizations is the odd one:
 * it is not a narrowing of the list but a different body entirely, because the
 * mock treats the directory of organizations as part of this tab rather than as
 * a tab of its own.
 */

/**
 * Two pills: the calendar and the organizations (the owner, 2026-10-10).
 *
 * There were seven. Going, Interested and Been to are the member's own RSVPs,
 * and are now "Your RSVP" in Filters, beside the other ways of narrowing the
 * list; Adaptive sport and Online were narrowings the sheet already had (the
 * Sport tags, and "Getting there"). The URL still names the RSVP list, so
 * Me's counters link straight to it.
 */
type EventsPill = 'events' | 'orgs';
const PILLS: [EventsPill, string][] = [
  ['events', 'Events'],
  ['orgs', 'Organizations'],
];

/** The RSVP lists, by the words Filters and the "Showing" line use. */
const RSVP_LABELS: Record<'going' | 'interested' | 'been-to', string> = {
  going: "I'm going",
  interested: 'Interested',
  'been-to': 'Been to',
};

export default function EventsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const announce = useAnnounce();
  const memberId = session.status === 'signed-in' ? session.userId : null;

  const { byEvent: attendeesByEvent } = useAttendeesByEvent();
  const { organizations, byId: organizationsById } = useOrganizations();
  const follows = useOrganizationFollows();
  const viewer = useViewerEvents(memberId);
  const account = useAccount();
  const mine = useMyOrganizations(memberId);
  const canAdd = account.status === 'member' && mayAddEvents(account.isAdmin, mine.ids);

  // The segment lives in the URL, not in component state. Opening an
  // organization and pressing back used to land on Upcoming, because the state
  // died with the unmounted page — and a back arrow that does not go back is
  // worse than no back arrow. It also makes a segment linkable and survives a
  // refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('segment');
  // Adaptive sport and Online are no longer lists of their own (see PILLS);
  // an old link to one opens the whole calendar.
  const segment: EventsSegment =
    EVENTS_SEGMENTS.includes(fromUrl as EventsSegment) &&
    fromUrl !== 'sport' &&
    fromUrl !== 'online'
      ? (fromUrl as EventsSegment)
      : 'upcoming';
  const setSegment = useCallback(
    (next: EventsSegment) => {
      // Replace rather than push: the segment pills are a filter, and tapping
      // through four of them should not mean four presses of back to leave.
      setSearchParams(next === 'upcoming' ? {} : { segment: next }, { replace: true });
    },
    [setSearchParams],
  );
  const [filters, setFilters] = useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const dateRange = dateWindowRange(
    isRsvpSegment(segment) ? (segment === 'been-to' ? 'past' : 'any') : filters.when,
  );
  const { events, loading, error } = useEvents(dateRange ?? {});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const viewerState = useMemo(() => ({ rsvps: viewer.rsvps }), [viewer.rsvps]);

  const visible = useMemo(
    () => filterEvents(events, filters, segment, viewerState),
    [events, filters, segment, viewerState],
  );

  // Grouped only in the browsing segments. "I'm going", "Interested" and
  // "Been to" are lists of particular dates a member chose, and collapsing the
  // three Fridays they said yes to into one row would hide the answer they came
  // for.
  const grouped = useMemo(() => {
    if (isRsvpSegment(segment)) {
      return visible.map((event) => ({ lead: event, rest: [], seriesId: event.seriesId }));
    }
    return groupBySeries(visible);
  }, [visible, segment]);

  // Which series are open, by series id. Reset when the segment or the window
  // changes: an expansion is about the list in front of you, and leaving it
  // open across a filter change reopens a group whose dates are now different.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const filterKey = `${segment}|${filters.when}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setExpanded(new Set());
  }

  const toggleSeries = useCallback((seriesId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(seriesId)) next.add(seriesId);
      return next;
    });
  }, []);

  // The sheet's options come from the events the segment and the date window
  // have already selected, not from the whole calendar: a chip offered while
  // "Online" is on should narrow the online events, and a city chip offered
  // while the window says "Next 7 days" should be a city with an event in the next
  // seven. The other narrowing filters are deliberately *not* applied — they are
  // what the sheet is for, and dropping them means picking one city does not
  // make every other city vanish from the list you picked it from.
  const inSegment = useMemo(
    () =>
      filterEvents(events, { ...EMPTY_EVENT_FILTERS, when: filters.when }, segment, viewerState),
    [events, segment, viewerState, filters.when],
  );

  const hostingOrganizations = useMemo(() => {
    const hosting = organizationIdsIn(inSegment);
    return organizations.filter((organization) => hosting.has(organization.id));
  }, [organizations, inSegment]);

  const onRsvp = useCallback(
    (eventId: string, next: RsvpStatus | null) => {
      if (!memberId) return;
      setWriteError(null);
      void setRsvp(eventId, memberId, next).then((result) => {
        // Re-read rather than patching local state: the tallies on every card
        // come from the database, and a local edit would leave the number and
        // the button disagreeing until the next load.
        if (result.ok) {
          viewer.reload();
          announce(rsvpSaved(next));
        } else setWriteError(result.error ?? 'Could not save that.');
      });
    },
    [memberId, viewer, announce],
  );

  // The RSVP choice lives in the URL (as the segment) but is one of the
  // filters, so it counts towards the dot.
  const rsvp = isRsvpSegment(segment) ? (segment as keyof typeof RSVP_LABELS) : null;
  const filterCount = activeFilterCount(filters) + (rsvp ? 1 : 0);
  const showingList = segment !== 'orgs';
  // Reached from Me and nowhere else, so it gets its own title and a way back
  // rather than an unlit chip row somebody cannot tell they are inside.

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto flex min-h-[38px] w-full max-w-[var(--events-measure)] flex-wrap items-center justify-between gap-2.5">
          <h1 className="font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Events
          </h1>
          <div className="flex items-center gap-2">
            {canAdd ? (
              <Link
                to="/events/new"
                className="flex min-h-[38px] items-center gap-1.5 rounded-full bg-tint px-3.5 font-semibold text-[0.84375rem] text-emphasis transition-colors hover:bg-line"
                data-target="small"
              >
                <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden="true" />
                Add an event
              </Link>
            ) : null}
            {showingList ? (
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(true);
                }}
                aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
                data-target="small"
                className="relative grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-tint transition-colors hover:bg-line"
              >
                <SlidersHorizontal className="h-[17px] w-[17px] text-emphasis" strokeWidth={2} />
                {filterCount ? (
                  <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        <SegmentPills
          segments={PILLS}
          value={segment === 'orgs' ? 'orgs' : 'events'}
          onChange={(next) => {
            setSegment(next === 'orgs' ? 'orgs' : 'upcoming');
          }}
          className="max-w-[var(--events-measure)]"
        />
        {/* Said, so a narrowed list is never mistaken for the calendar. */}
        {rsvp ? (
          <p className="mx-auto flex w-full max-w-[var(--events-measure)] flex-wrap items-center gap-x-2 pb-2.5 text-[0.8125rem] text-ink2">
            <span>
              Showing: <span className="font-bold text-ink">{RSVP_LABELS[rsvp]}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSegment('upcoming');
              }}
              className="min-h-[36px] font-semibold text-emphasis underline underline-offset-2"
              data-target="small"
            >
              Show all events
            </button>
          </p>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          {writeError ? (
            <p className="mb-2.5 rounded-xl bg-danger-lt px-3.5 py-2.5 text-[0.7875rem] text-danger-ink">
              {writeError}
            </p>
          ) : null}

          {segment === 'orgs' ? (
            <OrganizationList
              organizations={organizations}
              events={events}
              following={follows.following}
              onToggleFollow={follows.toggle}
              onOpen={(id) => {
                void navigate(`/events/organizations/${id}`, { state: { segment } });
              }}
            />
          ) : loading ? (
            <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading events…</p>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[0.875rem] text-ink2 leading-relaxed">Could not load events.</p>
              <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
            </div>
          ) : (
            <>
              {grouped.map((group) => {
                const isOpen = group.seriesId !== null && expanded.has(group.seriesId);
                const hasMore = group.rest.length > 0;
                const card = (event: ClubEvent, asLine: boolean) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    past={!asLine && isPastEvent(event)}
                    occurrence={asLine}
                    attached={asLine}
                    footer={
                      !asLine && hasMore && group.seriesId ? (
                        <SeriesFooter
                          group={group}
                          expanded={isOpen}
                          onToggle={() => {
                            if (group.seriesId) toggleSeries(group.seriesId);
                          }}
                        />
                      ) : undefined
                    }
                    status={viewer.rsvps.get(event.id) ?? null}
                    attendees={attendeesByEvent.get(event.id) ?? []}
                    organization={
                      event.organizationId
                        ? (organizationsById.get(event.organizationId) ?? null)
                        : null
                    }
                    onOpen={() => {
                      void navigate(`/events/${event.id}`, { state: { segment } });
                    }}
                    onRsvp={(next) => {
                      onRsvp(event.id, next);
                    }}
                  />
                );

                return (
                  <div key={group.lead.id} className="mb-[11px]">
                    {card(group.lead, false)}
                    {/* The other dates as lines, the same shape a past event
                        takes: the title and host are already above, so what is
                        left to read is when. Each keeps its own RSVP through
                        its own detail page. */}
                    {isOpen ? (
                      // Indented, so a bare date reads as another date of the
                      // card above rather than as an event of its own.
                      <div className="mt-1 pl-3">
                        {group.rest.map((event) => card(event, true))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {visible.length === 0 ? <EmptyList segment={segment} /> : null}
            </>
          )}
        </div>
      </div>

      {sheetOpen && showingList ? (
        <EventFilterSheet
          tags={tagsIn(inSegment)}
          formats={formatsIn(inSegment)}
          cities={citiesIn(inSegment)}
          organizations={hostingOrganizations}
          following={follows.following}
          filters={filters}
          rsvp={rsvp}
          onRsvpChange={(next) => {
            setSegment(next ?? 'upcoming');
          }}
          matchCount={visible.length}
          activeCount={filterCount}
          onChange={setFilters}
          onClear={() => {
            setFilters(EMPTY_EVENT_FILTERS);
            setSegment('upcoming');
          }}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Empty states say which emptiness this is.
 *
 * "Nothing here yet" under "I'm going" is a different sentence from the same
 * words under a filtered calendar: one means you have not said yes to anything,
 * the other means the filters are too narrow. Telling somebody to widen filters
 * they never set is how an app teaches people to distrust it.
 */
function EmptyList({ segment }: { segment: EventsSegment }) {
  if (segment === 'going') {
    return (
      <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
        You have not said you are going to anything yet.
        <br />
        Events you say yes to show up here.
      </p>
    );
  }
  if (segment === 'been-to') {
    return (
      <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
        Nothing here yet.
        <br />
        Events you said you were going to appear here once they have happened.
      </p>
    );
  }
  if (segment === 'interested') {
    // Its own sentence rather than "nothing matches that": an empty Interested
    // is not a filter that found nothing, it is a question nobody has answered
    // yet, and the two read very differently to somebody new.
    return (
      <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
        Nothing marked interested yet.
        <br />
        Tap Interested on an event to keep it here while you decide.
      </p>
    );
  }
  return (
    <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
      Nothing on the calendar for that.
      <br />
      Try a wider date range or fewer filters.
    </p>
  );
}
