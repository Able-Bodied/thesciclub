import { CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ClubMark } from '@/components/club-mark';
import { useAccount } from '@/lib/account';
import { fetchPublicEvent, type PublicEvent } from '@/lib/event-audience';
import { HAND_ADDED_TIMEZONE } from '@/lib/events';
import { EventCover } from '@/routes/events/event-cover';
import { eventMeetingLink } from '@/routes/events/event-meeting-link';
import { longWhen, timeRange } from '@/routes/events/format';
import { MeetingLinkButton } from '@/routes/events/meeting-link-button';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { EventDescription, safeHref } from '@/routes/events/rich-text';

/**
 * A public event's page, for anybody with the link (the owner, 2026-10-22;
 * public_event, 20261022180000).
 *
 * What an organization would post on its own calendar, and nothing that says
 * who is in the club: no counts, nobody's name (not even the host's, who may
 * be a member), no comments, no group chat. Going and Interested open the
 * registration form (./register.tsx). A member who is signed in is sent to the
 * event's own page, which has all of that.
 */
export default function PublicEventPage() {
  const { id = '' } = useParams<{ id: string }>();
  const account = useAccount();
  const navigate = useNavigate();
  const [event, setEvent] = useState<PublicEvent | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicEvent(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setEvent(result.value);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (account.status === 'member') return <Navigate to={`/events/${id}`} replace />;

  const timezone = event?.timezone ?? HAND_ADDED_TIMEZONE;
  const over = event ? new Date(event.endTime ?? event.startTime).getTime() < Date.now() : false;
  const place = event ? [event.location, event.city].filter(Boolean).join(' · ') : '';
  const registerHref = safeHref(event?.registrationUrl ?? null);
  const pageHref = safeHref(event?.url ?? null);
  const meeting = event ? eventMeetingLink(event) : null;
  const moreHref = meeting?.inUrl ? null : pageHref;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-canvas pb-[max(28px,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-3">
        <Link to="/join" aria-label="The SCI Club">
          <ClubMark size={44} className="h-11 w-auto" />
        </Link>
        <Link
          to={signInTo(id)}
          className="font-bold font-head text-[0.875rem] text-emphasis underline"
        >
          Sign in
        </Link>
      </header>

      {event === undefined && !error ? (
        <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
          Loading…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-6 py-10 text-center text-[0.875rem] text-ink2">
          {error}
        </p>
      ) : null}
      {event === null ? (
        <div className="px-6 py-10 text-center">
          <h1 className="font-extrabold font-head text-[1.25rem] text-ink">
            This event has no public page
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            It may be for the club's members only, or it is no longer on the calendar.
          </p>
          <Link
            to="/join"
            className="mt-4 inline-block font-bold font-head text-[0.9375rem] text-emphasis underline"
          >
            Sign in to the club
          </Link>
        </div>
      ) : null}

      {event ? (
        <article className="px-[18px]">
          <EventCover path={event.photoPath} alt={event.photoAlt} size="page" className="mb-4" />
          <p className="flex items-center gap-1.5 font-bold text-[0.75rem] text-gold-dp uppercase tracking-[0.07em]">
            <CalendarDays className="h-[13px] w-[13px]" aria-hidden="true" />
            {longWhen(event.startTime, timezone, event.allDay)}
          </p>
          <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink leading-[1.25] tracking-[-0.01em]">
            {event.title}
          </h1>
          <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.45]">
            {[timeRange(event.startTime, event.endTime, timezone, event.allDay), place]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {meeting && !over ? (
            <MeetingLinkButton
              href={meeting.href}
              service={meeting.service}
              tone="page"
              className="mt-4"
            />
          ) : null}

          {over ? (
            <p className="mt-4 text-[0.875rem] text-grey">This event is over.</p>
          ) : (
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void navigate(`/e/${event.id}/register?status=going`);
                }}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold"
              >
                Going
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigate(`/e/${event.id}/register?status=interested`);
                }}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.9375rem] text-emphasis"
              >
                Interested
              </button>
            </div>
          )}

          <EventDescription
            html={event.descriptionHtml}
            text={event.description}
            className="mt-5 text-[0.9375rem] text-ink leading-[1.55] [&>*+*]:mt-3"
          />

          {moreHref || registerHref ? (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.875rem]">
              {moreHref ? (
                <a
                  href={moreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center font-bold text-emphasis underline"
                >
                  Details on their site
                </a>
              ) : null}
              {registerHref ? (
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center font-bold text-emphasis underline"
                >
                  The organizer's sign-up
                </a>
              ) : null}
            </p>
          ) : null}

          {event.organization ? (
            <>
              <h2 className="mt-6 mb-2 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
                Hosted by
              </h2>
              <div className="flex items-center gap-3 rounded-[14px] border border-line bg-paper p-3">
                <OrganizationBadge organization={event.organization} />
                <span className="font-extrabold font-head text-[0.9375rem] text-ink">
                  {event.organization.name}
                </span>
              </div>
            </>
          ) : null}

          <p className="mt-6 text-center text-[0.84375rem] text-ink2">
            In the club?{' '}
            <Link to={signInTo(id)} className="font-bold text-emphasis underline">
              Sign in
            </Link>{' '}
            to see who's going.
          </p>
        </article>
      ) : null}
    </main>
  );
}

/** Sign in, and come back to the event's own page. */
function signInTo(eventId: string): string {
  return `/join?next=${encodeURIComponent(`/events/${eventId}`)}`;
}
