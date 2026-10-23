import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import { type AudienceHint, fetchAudienceHint, publicEventUrl } from '@/lib/event-audience';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { FollowButton } from '@/routes/events/follow-button';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { ClubEvent, EventAudience } from '@/types/domain';

/**
 * The pieces of an event's page that come from who can see it
 * (20261022180000): what the audience is, the public link, the guest list for
 * its organizers, and, for a member outside the audience who has the link,
 * who the event is for and nothing more.
 */

export function audienceLabel(audience: EventAudience, organizationName: string | null): string {
  switch (audience) {
    case 'public':
      return 'Anyone with the link';
    case 'club':
      return 'Everyone in the club';
    case 'followers':
      return organizationName ? `Followers of ${organizationName}` : 'Followers';
    case 'groups':
      return 'Members of chosen groups';
  }
}

const HEADING =
  'mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';

/** Who can see it, the link to share a public event, and the organizers' guest list. */
export function EventAudienceSection({
  event,
  organizationName,
  canChange,
}: {
  event: ClubEvent;
  organizationName: string | null;
  canChange: boolean;
}) {
  const announce = useAnnounce();
  const link = publicEventUrl(event.id);
  return (
    <>
      <h2 className={HEADING}>Who can see it</h2>
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <p className="font-bold text-[0.90625rem] text-ink">
          {audienceLabel(event.audience, organizationName)}
        </p>
        {event.audience === 'public' ? (
          <>
            <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
              Anyone with the link sees the event and can register. Who's going stays in the club.
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="min-w-0 break-all text-[0.8125rem] text-ink2">{link}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(
                    () => {
                      announce('The link is copied.');
                    },
                    () => {
                      announce('Could not copy the link.');
                    },
                  );
                }}
                className="min-h-[44px] flex-none rounded-[10px] bg-tint px-3 font-bold text-[0.8125rem] text-emphasis"
              >
                Copy link
              </button>
            </div>
          </>
        ) : null}
      </div>
      {canChange ? (
        <Link
          to={`/events/${event.id}/guests`}
          className="mt-2.5 flex min-h-[46px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
        >
          <Users className="h-[17px] w-[17px]" aria-hidden="true" />
          Guest list
        </Link>
      ) : null}
    </>
  );
}

/**
 * For a member who opened a link to an event they cannot see: who it is for.
 * Never the title, the time or the place, and never which group. Falls back to
 * `missing` when there is no such event at all.
 */
export function OutsideTheAudience({
  eventId,
  missing,
  onFollowed,
}: {
  eventId: string;
  missing: React.ReactNode;
  onFollowed: () => void;
}) {
  const [hint, setHint] = useState<AudienceHint | null | undefined>(undefined);
  const follows = useOrganizationFollows();

  useEffect(() => {
    let cancelled = false;
    void fetchAudienceHint(eventId).then((value) => {
      if (!cancelled) setHint(value);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (hint === undefined) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }
  if (hint === null) return <>{missing}</>;

  const organization = hint.organization;
  return (
    <div className="mx-auto w-full max-w-[420px] px-6 py-10 text-center">
      {hint.audience === 'followers' && organization ? (
        <>
          <OrganizationBadge organization={organization} size="lg" className="mx-auto" />
          <h1 className="mt-3 font-extrabold font-head text-[1.25rem] text-ink">
            For {organization.name}'s followers
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            This event is for members who follow {organization.name}. Follow them to see it and say
            you're going.
          </p>
          <FollowButton
            following={follows.following.has(organization.id)}
            onToggle={() => {
              follows.toggle(organization.id);
              // Seen once the follow is saved: the page reads the event again.
              window.setTimeout(onFollowed, 800);
            }}
            className="mx-auto mt-4"
          />
        </>
      ) : (
        <>
          <h1 className="font-extrabold font-head text-[1.25rem] text-ink">
            For a group you're not in
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            This event is for the members of a group chat. Ask whoever shared it to add you.
          </p>
        </>
      )}
    </div>
  );
}
