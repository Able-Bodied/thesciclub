import { SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setDismissed,
  setRsvp,
  useAttendeesByEvent,
  useEvents,
  useViewerEvents,
} from '@/lib/events';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { EventCard } from '@/routes/events/event-card';
import { EventFilterSheet } from '@/routes/events/filter-sheet';
import {
  activeFilterCount,
  citiesIn,
  filterEvents,
  formatsIn,
  organizationIdsIn,
  tagsIn,
} from '@/routes/events/filters';
import { OrganizationList } from '@/routes/events/organization-list';
import {
  EMPTY_EVENT_FILTERS,
  type EventFilters,
  type EventsSegment,
  type RsvpStatus,
} from '@/types/domain';

/**
 * Events — what there is to go to, from the partner organizations' own
 * calendars.
 *
 * Nothing on this screen is written by the club. Every event here was published
 * by somebody else and ingested (jobs/event-ingest), which is why there is no
 * "create an event" affordance and no plan for one.
 *
 * The segments are the mock's, from `evPage()`. Organizations is the odd one:
 * it is not a narrowing of the list but a different body entirely, because the
 * mock treats the directory of organizations as part of this tab rather than as
 * a tab of its own.
 */

const SEGMENTS: [EventsSegment, string][] = [
  ['upcoming', 'Upcoming'],
  ['going', "I'm going"],
  ['sport', 'Adaptive sport'],
  ['online', 'Online'],
  ['orgs', 'Organizations'],
];

export default function EventsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const memberId = session.status === 'signed-in' ? session.userId : null;

  const { events, loading, error } = useEvents();
  const { byEvent: attendeesByEvent } = useAttendeesByEvent();
  const { organizations, byId: organizationsById } = useOrganizations();
  const viewer = useViewerEvents(memberId);

  const [segment, setSegment] = useState<EventsSegment>('upcoming');
  const [filters, setFilters] = useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const viewerState = useMemo(
    () => ({ rsvps: viewer.rsvps, dismissed: viewer.dismissed }),
    [viewer.rsvps, viewer.dismissed],
  );

  const visible = useMemo(
    () => filterEvents(events, filters, segment, viewerState),
    [events, filters, segment, viewerState],
  );

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
        if (result.ok) viewer.reload();
        else setWriteError(result.error ?? 'Could not save that.');
      });
    },
    [memberId, viewer],
  );

  const onDismiss = useCallback(
    (eventId: string) => {
      if (!memberId) return;
      setWriteError(null);
      void setDismissed(eventId, memberId, true).then((result) => {
        if (result.ok) viewer.reload();
        else setWriteError(result.error ?? 'Could not hide that.');
      });
    },
    [memberId, viewer],
  );

  const filterCount = activeFilterCount(filters);
  const showingList = segment !== 'orgs';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto flex min-h-[38px] w-full max-w-[1100px] items-center justify-between gap-2.5">
          <h1 className="font-extrabold font-head text-[25px] text-ink tracking-[-0.02em]">
            Events
          </h1>
          {showingList ? (
            <button
              type="button"
              onClick={() => {
                setSheetOpen(true);
              }}
              aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
              className="relative grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-tint"
            >
              <SlidersHorizontal className="h-[17px] w-[17px] text-navy" strokeWidth={2} />
              {filterCount ? (
                <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
              ) : null}
            </button>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-[1100px] gap-[7px] overflow-x-auto py-[11px] [scrollbar-width:none]">
          {SEGMENTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSegment(value);
              }}
              aria-pressed={segment === value}
              className={cn(
                'flex-none whitespace-nowrap rounded-full px-3.5 py-[7px] font-semibold text-[13.5px]',
                segment === value ? 'bg-navy text-white' : 'bg-tint text-ink2',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] lg:px-6">
        <div className="mx-auto w-full max-w-[1100px]">
          {writeError ? (
            <p className="mb-2.5 rounded-xl bg-[#FBE9E7] px-3.5 py-2.5 text-[12.6px] text-[#8C1D18]">
              {writeError}
            </p>
          ) : null}

          {segment === 'orgs' ? (
            <OrganizationList
              organizations={organizations}
              onOpen={(id) => {
                void navigate(`/events/organizations/${id}`);
              }}
            />
          ) : loading ? (
            <p className="px-6 py-10 text-center text-[14px] text-grey">Loading events…</p>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[14px] text-ink2 leading-relaxed">Could not load events.</p>
              <p className="mt-2 text-[12.5px] text-grey leading-relaxed">{error}</p>
            </div>
          ) : (
            <>
              {visible.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  status={viewer.rsvps.get(event.id) ?? null}
                  attendees={attendeesByEvent.get(event.id) ?? []}
                  organization={
                    event.organizationId
                      ? (organizationsById.get(event.organizationId) ?? null)
                      : null
                  }
                  onOpen={() => {
                    void navigate(`/events/${event.id}`);
                  }}
                  onRsvp={(next) => {
                    onRsvp(event.id, next);
                  }}
                  onDismiss={() => {
                    onDismiss(event.id);
                  }}
                />
              ))}
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
          filters={filters}
          matchCount={visible.length}
          activeCount={filterCount}
          onChange={setFilters}
          onClear={() => {
            setFilters(EMPTY_EVENT_FILTERS);
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
      <p className="px-6 py-10 text-center text-[14px] text-grey leading-relaxed">
        You have not said you are going to anything yet.
        <br />
        Events you say yes to show up here.
      </p>
    );
  }
  return (
    <p className="px-6 py-10 text-center text-[14px] text-grey leading-relaxed">
      Nothing on the calendar for that.
      <br />
      Try a wider date range or fewer filters.
    </p>
  );
}
