import { CalendarDays, ChevronRight, ExternalLink } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { setRsvp, useAttendeesByEvent, useEvents, useViewerEvents } from '@/lib/events';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { AttendeeAvatar } from '@/routes/events/attendee-avatar';
import { backLabel, backToEvents } from '@/routes/events/back';
import { isOnline } from '@/routes/events/filters';
import { longWhen, timeRange } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { placeLine } from '@/routes/events/place';
import { EventDescription } from '@/routes/events/rich-text';
import type { EventAttendee, RsvpStatus } from '@/types/domain';

/**
 * One event, matching `evDetail()` in the mock: a navy hero carrying the when,
 * the what and the two RSVP buttons, then the description, who is going, and
 * who is hosting.
 *
 * The group chat card the mock shows is deliberately not here. Messaging is not
 * built (docs/CONTEXT.md), and the convention in this codebase is that a
 * surface says so plainly rather than showing a button that does nothing — so
 * the place where a group chat would go says what it would be and that it does
 * not exist yet.
 */
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const back = backToEvents(location);
  const session = useSession();
  const memberId = session.status === 'signed-in' ? session.userId : null;

  const { events, loading, error } = useEvents();
  const { byEvent } = useAttendeesByEvent();
  const { byId: organizationsById } = useOrganizations();
  const viewer = useViewerEvents(memberId);
  const [writeError, setWriteError] = useState<string | null>(null);

  const event = events.find((candidate) => candidate.id === id) ?? null;

  const onRsvp = useCallback(
    (next: RsvpStatus | null) => {
      if (!memberId || !id) return;
      setWriteError(null);
      void setRsvp(id, memberId, next).then((result) => {
        if (result.ok) viewer.reload();
        else setWriteError(result.error ?? 'Could not save that.');
      });
    },
    [memberId, id, viewer],
  );

  if (loading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
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
          className="mt-4 font-bold font-head text-[0.9375rem] text-navy"
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
  const goingList = attendees.filter((a) => a.status === 'going');
  const interestedList = attendees.filter((a) => a.status === 'interested');
  const organization = event.organizationId
    ? (organizationsById.get(event.organizationId) ?? null)
    : null;
  const host = organization?.name ?? event.hostName;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-navy px-4 pt-[18px] pb-5 text-white">
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

          {/* A calendar, because the line is a date. This was a map pin, which
              says "place" in front of text that says "Friday 11 September". */}
          <div className="flex items-center gap-1.5 font-bold text-[#EBD277] text-[0.71875rem] uppercase tracking-[0.07em]">
            <CalendarDays className="h-[13px] w-[13px]" aria-hidden="true" />
            <span>{longWhen(event.startTime, event.timezone)}</span>
          </div>

          <h1 className="mt-2 font-extrabold font-head text-[1.4375rem] leading-[1.28] tracking-[-0.02em]">
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
                <span className="rounded-full bg-[#3A2F12] px-2.5 py-[5px] font-semibold text-[#EBD277] text-[0.7375rem]">
                  {event.format === 'hybrid' ? 'Hybrid' : 'Online'}
                </span>
              ) : null}
              {event.tags.map((tag) => (
                <span
                  key={tag.slug}
                  className="rounded-full bg-[#22406B] px-2.5 py-[5px] font-semibold text-[#DDE7F3] text-[0.7375rem]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-[15px] grid grid-cols-2 gap-[9px]">
            <button
              type="button"
              onClick={() => {
                onRsvp(going ? null : 'going');
              }}
              aria-pressed={going}
              className={cn(
                'flex min-h-[44px] items-center justify-center rounded-[13px] font-bold font-head text-[0.9375rem]',
                going ? 'bg-tint text-navy' : 'bg-gold text-[#2A1E06]',
              )}
            >
              {going ? "You're going" : "I'm going"}
            </button>
            <button
              type="button"
              onClick={() => {
                onRsvp(interested ? null : 'interested');
              }}
              aria-pressed={interested}
              className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.6px] border-[#5C7BA5] font-bold font-head text-[0.9375rem] text-white"
            >
              {interested ? 'Interested ✓' : 'Interested'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pb-5">
        {writeError ? (
          <p className="mt-3 rounded-xl bg-[#FBE9E7] px-3.5 py-2.5 text-[#8C1D18] text-[0.7875rem]">
            {writeError}
          </p>
        ) : null}

        <EventDescription
          html={event.descriptionHtml}
          text={event.description}
          className="mt-2.5 text-[0.8875rem] text-ink leading-[1.52] [&_a]:text-navy [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2.5"
        />

        {event.registrationUrl || event.url ? (
          <a
            href={event.registrationUrl ?? event.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3.5 flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[0.9375rem] text-navy"
          >
            {event.registrationUrl ? 'Register' : 'Details on their site'}
            <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />
          </a>
        ) : null}

        {/* Where the mock puts a group chat. Messaging is not built, and a
            button that does nothing gets demoed, believed, and then explained. */}
        {going ? (
          <p className="mt-3.5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
            There will be a group chat for everyone going to this. It is not built yet.
          </p>
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
