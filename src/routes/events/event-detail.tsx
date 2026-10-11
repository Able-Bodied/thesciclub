import { CalendarDays, ChevronRight, ExternalLink } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import {
  deleteEvent,
  deleteEventAndLater,
  rsvpSaved,
  setRsvp,
  useAttendeesByEvent,
  useEvents,
  useViewerEvents,
} from '@/lib/events';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { AttendeeAvatar } from '@/routes/events/attendee-avatar';
import { backLabel, backToEvents } from '@/routes/events/back';
import { GOING_SHARES_NUMBER } from '@/routes/events/event-card';
import { EventCover } from '@/routes/events/event-cover';
import { mayChangeEvent } from '@/routes/events/event-draft';
import { EventGroupCard } from '@/routes/events/event-group-card';
import { isOnline, isPastEvent } from '@/routes/events/filters';
import { longWhen, timeRange } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { placeLine } from '@/routes/events/place';
import { EventDescription, safeHref } from '@/routes/events/rich-text';
import type { EventAttendee, RsvpStatus } from '@/types/domain';

/**
 * One event, matching `evDetail()` in the mock: a navy hero carrying the when,
 * the what and the two RSVP buttons, then the description, who is going, and
 * who is hosting.
 *
 * The group chat card the mock shows is real as of Phase 5 of Chat, and is
 * `EventGroupCard` — rendered only for a signed-in member, because the card reads the viewer's own conversations to know
 * whether they are already in the group.
 */
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const back = backToEvents(location);
  const session = useSession();
  const announce = useAnnounce();
  const memberId = session.status === 'signed-in' ? session.userId : null;

  const { events, loading, error } = useEvents({
    id: id ?? '00000000-0000-0000-0000-000000000000',
  });
  const { byEvent } = useAttendeesByEvent();
  const { byId: organizationsById } = useOrganizations();
  const viewer = useViewerEvents(memberId);
  const account = useAccount();
  const mine = useMyOrganizations(memberId);
  const [writeError, setWriteError] = useState<string | null>(null);
  const goingNote = useId();

  const event = events.find((candidate) => candidate.id === id) ?? null;

  const onRsvp = useCallback(
    (next: RsvpStatus | null) => {
      if (!memberId || !id) return;
      setWriteError(null);
      void setRsvp(id, memberId, next).then((result) => {
        if (result.ok) {
          viewer.reload();
          announce(rsvpSaved(next));
        } else setWriteError(result.error ?? 'Could not save that.');
      });
    },
    [memberId, id, viewer, announce],
  );

  if (loading) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[0.875rem] text-ink2">Could not load this event.</p>
        <p className="mt-2 text-[0.78125rem] text-grey">{error}</p>
      </div>
    );
  }
  if (!event) {
    // An event that has finished and been cleared, or a link somebody kept. Not
    // an error to report — just a thing that is no longer there.
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[0.875rem] text-ink2 leading-relaxed">
          This event is not on the calendar.
        </p>
        <button
          type="button"
          onClick={() => {
            void navigate(back);
          }}
          className="mt-4 font-bold font-head text-[0.9375rem] text-emphasis"
        >
          Back to Events
        </button>
      </div>
    );
  }

  const status = viewer.rsvps.get(event.id) ?? null;
  const going = status === 'going';
  const interested = status === 'interested';
  const attendees = byEvent.get(event.id) ?? [];
  // Both addresses come from another organization's website, through the
  // ingest job, which resolves the registration button's href without asking
  // what scheme it has. The description's links already pass through safeHref;
  // these two are links on the same page from the same source.
  const registerHref = safeHref(event.registrationUrl);
  const pageHref = safeHref(event.url);
  const goingList = attendees.filter((a) => a.status === 'going');
  const interestedList = attendees.filter((a) => a.status === 'interested');
  const organization = event.organizationId
    ? (organizationsById.get(event.organizationId) ?? null)
    : null;
  const host = organization?.name ?? event.hostName;
  const canChange = account.status === 'member' && mayChangeEvent(event, account.isAdmin, mine.ids);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-plate px-4 pt-[18px] pb-5 text-white">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          <button
            type="button"
            onClick={() => {
              void navigate(back);
            }}
            className="block pb-3 text-[#B9CADF] text-[0.875rem]"
          >
            ← {backLabel(location)}
          </button>

          <EventCover path={event.photoPath} alt={event.photoAlt} size="page" className="mb-4" />

          {/* A calendar, because the line is a date. This was a map pin, which
              says "place" in front of text that says "Friday 11 September". */}
          <div className="flex items-center gap-1.5 font-bold text-gold-hi text-[0.71875rem] uppercase tracking-[0.07em]">
            <CalendarDays className="h-[13px] w-[13px]" aria-hidden="true" />
            <span>{longWhen(event.startTime, event.timezone)}</span>
          </div>

          <h1 className="mt-2 font-extrabold font-display text-[1.4375rem] leading-[1.28] tracking-[-0.01em]">
            {event.title}
          </h1>

          <p className="mt-1.5 text-[#B9CADF] text-[0.8125rem] leading-[1.42]">
            {[timeRange(event.startTime, event.endTime, event.timezone), placeLine(event)]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {isOnline(event) || event.tags.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {isOnline(event) ? (
                <span className="rounded-full bg-[#3A2F12] px-2.5 py-[5px] font-semibold text-gold-hi text-[0.7375rem]">
                  {event.format === 'hybrid' ? 'Hybrid' : 'Online'}
                </span>
              ) : null}
              {event.tags.map((tag) => (
                <span
                  key={tag.slug}
                  className="rounded-full bg-plate-chip px-2.5 py-[5px] font-semibold text-[#DDE7F3] text-[0.7375rem]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          {/* No RSVP on an event that is over. The list stopped offering it when
              past events became lines rather than cards; this screen kept
              offering it, so the same finished evening answered two different
              ways depending on how you arrived at it. What a member came here
              for afterwards is the description and the link, and those are
              below. */}
          {isPastEvent(event) ? (
            <p className="mt-[15px] text-[0.8125rem] text-[#9FB3CD] leading-[1.45]">
              {going
                ? 'You said you were going to this.'
                : interested
                  ? 'You were interested in this.'
                  : 'This has already happened.'}
            </p>
          ) : (
            <div className="mt-[15px] grid grid-cols-2 gap-[9px]">
              <button
                type="button"
                onClick={() => {
                  onRsvp(going ? null : 'going');
                }}
                aria-pressed={going}
                aria-describedby={goingNote}
                className={cn(
                  'flex min-h-[44px] items-center justify-center rounded-[13px] font-bold font-head text-[0.9375rem] transition-colors',
                  going
                    ? 'bg-tint text-emphasis hover:bg-line'
                    : 'bg-gold text-on-gold hover:bg-gold-hi',
                )}
              >
                {going ? 'Going ✓' : 'Going'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRsvp(interested ? null : 'interested');
                }}
                aria-pressed={interested}
                className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.6px] border-plate-edge font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-plate-hover"
              >
                {interested ? 'Interested ✓' : 'Interested'}
              </button>
              <p
                id={goingNote}
                className="col-span-2 text-[0.78125rem] text-[#B9CADF] leading-[1.45]"
              >
                {GOING_SHARES_NUMBER}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pb-5">
        {writeError ? (
          <p className="mt-3 rounded-xl bg-danger-lt px-3.5 py-2.5 text-danger-ink text-[0.7875rem]">
            {writeError}
          </p>
        ) : null}

        <EventDescription
          html={event.descriptionHtml}
          text={event.description}
          className="mt-2.5 text-[0.8875rem] text-ink leading-[1.52] [&_a]:text-emphasis [&_a]:underline [&_h3]:mt-3.5 [&_h3]:font-extrabold [&_h3]:font-head [&_h3]:text-[1rem] [&_li]:ml-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_p]:mt-2.5 [&_ul]:mt-2 [&_ul]:list-disc"
        />

        {registerHref || pageHref ? (
          <a
            href={registerHref ?? pageHref ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3.5 flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-tint"
          >
            {registerHref ? 'Register' : 'Details on their site'}
            <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />
          </a>
        ) : null}

        {/* Where the mock puts a group chat, and now what it puts there.
            Members only: the read behind it is the viewer's own conversation
            list, and an event page is the one surface that is public. */}
        {memberId ? (
          <EventGroupCard eventId={event.id} going={going} past={isPastEvent(event)} />
        ) : null}

        <AttendeeSection
          title="Going"
          attendees={goingList}
          // The tally counts everyone; this list only names members who let
          // themselves be browsed, so it can legitimately be shorter.
          total={event.goingCount}
          onOpen={(memberId) => {
            void navigate(`/peers/${memberId}`);
          }}
        />
        <AttendeeSection
          title="Interested"
          attendees={interestedList}
          total={event.interestedCount}
          onOpen={(memberId) => {
            void navigate(`/peers/${memberId}`);
          }}
        />

        {host ? (
          <>
            <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
              Hosted by
            </h2>
            {organization ? (
              <button
                type="button"
                onClick={() => {
                  void navigate(`/events/organizations/${organization.id}`);
                }}
                className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 text-left"
              >
                <OrganizationBadge organization={organization} />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
                    {organization.name}
                  </span>
                  <span className="block text-[0.78125rem] text-grey">{organization.city}</span>
                </span>
                <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
              </button>
            ) : (
              // A host from the feed that the club has no organization for. Not
              // a link, because there is no page to go to — pretending
              // otherwise is a dead end wearing a chevron.
              <p className="rounded-[14px] border border-line bg-paper p-3.5 text-[0.90625rem] text-ink">
                {host}
              </p>
            )}
          </>
        ) : null}

        {canChange ? (
          <ChangeEvent
            eventId={event.id}
            going={event.goingCount}
            repeats={event.seriesId !== null}
            onDeleted={(later) => {
              announce(
                later ? 'This date and the later ones are deleted.' : 'The event is deleted.',
              );
              void navigate('/events', { replace: true });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * One roster.
 *
 * Renders nothing at all when nobody has said yes — an empty "Going" heading
 * reads as a failure to load rather than as an accurate zero.
 *
 * When the tally is higher than the number of people named, it says so instead
 * of quietly showing fewer. The difference is members who opted out of being
 * browsed, and leaving it unexplained makes the count look broken.
 */
function AttendeeSection({
  title,
  attendees,
  total,
  onOpen,
}: {
  title: string;
  attendees: EventAttendee[];
  total: number;
  onOpen: (memberId: string) => void;
}) {
  if (total === 0) return null;
  const unnamed = total - attendees.length;

  return (
    <>
      <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title} · {total}
      </h2>
      {attendees.map((attendee) => (
        <button
          key={attendee.memberId}
          type="button"
          onClick={() => {
            onOpen(attendee.memberId);
          }}
          className="flex w-full items-center gap-3 border-line border-b py-[13px] text-left last:border-b-0"
        >
          <AttendeeAvatar attendee={attendee} />
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
              {attendee.displayName}
            </span>
            <span className="block text-[0.78125rem] text-grey">
              {[attendee.exactLevel ?? attendee.levelRange, attendee.city]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
        </button>
      ))}
      {unnamed > 0 ? (
        <p className="py-2.5 text-[0.78125rem] text-grey">
          {attendees.length === 0
            ? `${unnamed} member${unnamed === 1 ? '' : 's'}, not shown by choice`
            : `and ${unnamed} more who ${unnamed === 1 ? 'is' : 'are'} not shown by choice`}
        </p>
      ) : null}
    </>
  );
}

/**
 * Changing or deleting an event added by hand, for whoever may: an
 * administrator, or a member who speaks for its organization. A scraped event
 * never shows this — it is changed on its organization's own calendar.
 *
 * Deleting asks first, in place, and says what goes with it: the RSVPs. The
 * event's group chat stays (delete_event's header says why), so the question
 * does not claim otherwise.
 *
 * A date of a repeating event asks which (the owner, 2026-10-10, as Google
 * Calendar does): this date only, or this and every later date, which also
 * stops the series (delete_event_and_later). Changing is always this date only.
 */
function ChangeEvent({
  eventId,
  going,
  repeats,
  onDeleted,
}: {
  eventId: string;
  going: number;
  repeats: boolean;
  onDeleted: (later: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'one' | 'later' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirm(later: boolean) {
    setBusy(later ? 'later' : 'one');
    setError(null);
    void (later ? deleteEventAndLater(eventId) : deleteEvent(eventId)).then((result) => {
      setBusy(null);
      if (result.ok) onDeleted(later);
      else setError(result.error ?? 'The event was not deleted.');
    });
  }

  return (
    <>
      <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        Added in the club
      </h2>
      {asking ? (
        <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-3.5">
          <p className="text-[0.875rem] text-ink leading-[1.45]">
            {repeats ? 'This event repeats. Delete which dates? ' : 'Delete this event? '}
            {going > 0
              ? `${going} member${going === 1 ? ' has' : 's have'} said they are going to this date, and will find it gone.`
              : 'Nobody has said they are going to this date yet.'}{' '}
            Its group chat, if it has one, stays.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <div className={`mt-3 grid gap-[9px] ${repeats ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => {
                confirm(false);
              }}
              disabled={busy !== null}
              className="flex min-h-[44px] items-center justify-center rounded-[13px] bg-destructive-fill px-3 font-bold font-head text-[0.9375rem] text-white disabled:opacity-40"
            >
              {busy === 'one' ? 'Deleting…' : repeats ? 'This date only' : 'Delete'}
            </button>
            {repeats ? (
              <button
                type="button"
                onClick={() => {
                  confirm(true);
                }}
                disabled={busy !== null}
                className="flex min-h-[44px] items-center justify-center rounded-[13px] bg-destructive-fill px-3 font-bold font-head text-[0.9375rem] text-white disabled:opacity-40"
              >
                {busy === 'later' ? 'Deleting…' : 'This and all later dates'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                setError(null);
              }}
              disabled={busy !== null}
              className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.6px] border-line px-3 font-bold font-head text-[0.9375rem] text-ink"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[9px]">
          <Link
            to={`/events/${eventId}/edit`}
            className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-tint"
          >
            Change
          </Link>
          <button
            type="button"
            onClick={() => {
              setAsking(true);
            }}
            className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.6px] border-destructive/60 font-bold font-head text-[0.9375rem] text-destructive transition-colors hover:bg-destructive/5"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
