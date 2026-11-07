import { Lock, QrCode, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import {
  type AudienceHint,
  type EventVisibility,
  fetchAudienceHint,
  fetchEventVisibility,
  isPrivateAudience,
  publicEventUrl,
} from '@/lib/event-audience';
import { useOrganizationFollows } from '@/lib/organization-follows';
import type { AudienceOrganization } from '@/routes/events/audience-field';
import { EventGroupCard } from '@/routes/events/event-group-card';
import { ShortLinkField, ShortLinkQr } from '@/routes/events/event-short-link';
import { FollowButton } from '@/routes/events/follow-button';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { VisibilitySheet } from '@/routes/events/visibility-sheet';
import type { ClubEvent, EventAudience } from '@/types/domain';

/**
 * The pieces of an event's page that come from who can see it
 * (20261022180000): what the audience is, the link to share (every event has
 * one, 20261029110000), the guest list for its organizers, and, for a member outside the audience who has the link,
 * who the event is for and nothing more.
 */

export function audienceLabel(
  audience: EventAudience,
  organizationName: string | null,
  visibility: EventVisibility | null = null,
): string {
  switch (audience) {
    case 'club':
      return 'Everyone in the club';
    case 'followers':
      return organizationName ? `Members of ${organizationName}` : 'Its members';
    case 'groups':
      return 'Members of chosen groups';
    case 'organizations': {
      const names = visibility?.organizations.map((o) => o.name) ?? [];
      return names.length > 0
        ? `Members of ${names.join(', ')}`
        : 'Members of chosen organizations';
    }
    case 'people': {
      const count = visibility?.inviteeCount;
      return count === undefined
        ? 'Invite only'
        : `Invite only · ${count === 1 ? '1 person' : `${count} people`} invited`;
    }
  }
}

const POPUP_MS = 2000;

const HEADING =
  'mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';

/** Who can see it, the link to share it, and the organizers' guest list. */
export function EventAudienceSection({
  event,
  organizationName,
  canChange,
  canSeeCheckIns = false,
  canSetVisibility = false,
  adminOf = [],
  onChanged,
}: {
  event: ClubEvent;
  organizationName: string | null;
  canChange: boolean;
  /** The check-in QR code and who has used it. */
  canSeeCheckIns?: boolean;
  /** May change who sees it: an imported event's org admins too (20261106030000). */
  canSetVisibility?: boolean;
  /** The organizations they are an org admin of, for Members of an organization. */
  adminOf?: AudienceOrganization[];
  onChanged?: () => void;
}) {
  const announce = useAnnounce();
  const [visibility, setVisibility] = useState<EventVisibility | null>(null);
  const [changing, setChanging] = useState(false);
  const [readAgain, setReadAgain] = useState(0);
  const hidden = isPrivateAudience(event.audience);
  // Which organizations, or how many invited; and for the sheet, the lists.
  useEffect(() => {
    if (readAgain < 0 || (event.audience === 'club' && !canSetVisibility)) return;
    let live = true;
    void fetchEventVisibility(event.id).then((result) => {
      if (live && result.ok) setVisibility(result.value);
    });
    return () => {
      live = false;
    };
  }, [event.id, event.audience, canSetVisibility, readAgain]);
  const [shortLink, setShortLink] = useState(event.shortLink ?? null);
  const link = publicEventUrl(event.id, shortLink);
  // Seen, as well as heard (the owner, 2026-11-01): nothing else on the screen
  // changes when a link is copied.
  const [popup, setPopup] = useState<string | null>(null);
  useEffect(() => {
    if (!popup) return;
    const timer = setTimeout(() => {
      setPopup(null);
    }, POPUP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [popup]);
  const say = (words: string) => {
    setPopup(words);
    announce(`${words}.`);
  };
  return (
    <>
      {popup ? (
        // The announcement is what a screen reader hears; this would say it twice.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4"
        >
          <span className="rounded-full bg-action px-4 py-2 font-bold text-[0.875rem] text-white shadow-[0_6px_18px_rgba(10,20,35,.35)]">
            {popup}
          </span>
        </div>
      ) : null}
      <h2 className={HEADING}>Who can see it</h2>
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 font-bold text-[0.90625rem] text-ink">
            {hidden ? (
              <Lock aria-hidden="true" className="h-[14px] w-[14px] flex-none" strokeWidth={2.4} />
            ) : null}
            {audienceLabel(event.audience, organizationName, visibility)}
          </p>
          {canSetVisibility && visibility ? (
            <button
              type="button"
              onClick={() => {
                setChanging(true);
              }}
              className="-my-2 min-h-[44px] flex-none rounded-[10px] px-3 font-bold text-[0.8125rem] text-emphasis hover:bg-tint"
            >
              Change
            </button>
          ) : null}
        </div>
        {hidden ? (
          // The owner, 2026-11-06: a private event is not for whoever gets the link.
          <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
            Private. Nobody else can see it, in the app or from its link.
          </p>
        ) : (
          // Every event, to invite whoever you like (the owner, 2026-10-29).
          <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
            Share the link to invite anyone: they see the event and can add themselves to the guest
            list. Who's going stays in the club.
          </p>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="min-w-0 break-all text-[0.8125rem] text-ink2">{link}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(
                () => {
                  say('Link copied');
                },
                () => {
                  say('Could not copy the link');
                },
              );
            }}
            className="min-h-[44px] flex-none rounded-[10px] bg-tint px-3 font-bold text-[0.8125rem] text-emphasis"
          >
            Copy link
          </button>
        </div>
        {canChange ? (
          <ShortLinkField
            eventId={event.id}
            shortLink={shortLink}
            onSaved={setShortLink}
            say={say}
          />
        ) : null}
        {shortLink ? <ShortLinkQr link={link} title={event.title} /> : null}
      </div>
      {changing && visibility ? (
        <VisibilitySheet
          event={event}
          visibility={visibility}
          organizations={adminOf}
          onCancel={() => {
            setChanging(false);
          }}
          onSaved={() => {
            setChanging(false);
            setReadAgain((n) => n + 1);
            onChanged?.();
          }}
        />
      ) : null}
      {canChange ? (
        <Link
          to={`/events/${event.id}/guests`}
          className="mt-2.5 flex min-h-[46px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
        >
          <Users className="h-[17px] w-[17px]" aria-hidden="true" />
          Guest list
        </Link>
      ) : null}
      {canSeeCheckIns ? (
        <Link
          to={`/events/${event.id}/check-ins`}
          className="mt-2.5 flex min-h-[46px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
        >
          <QrCode className="h-[17px] w-[17px]" aria-hidden="true" />
          Check-ins and QR code
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
      {hint.audience === 'people' ? (
        <>
          <Lock aria-hidden="true" className="mx-auto h-7 w-7 text-grey" />
          <h1 className="mt-3 font-extrabold font-head text-[1.25rem] text-ink">Invite only</h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            This event is private, for the people its organizer invited. Ask whoever shared it to
            invite you.
          </p>
        </>
      ) : hint.audience === 'organizations' && !organization ? (
        <>
          <Lock aria-hidden="true" className="mx-auto h-7 w-7 text-grey" />
          <h1 className="mt-3 font-extrabold font-head text-[1.25rem] text-ink">Members only</h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            This event is private, for the members of the organizations hosting it.
          </p>
        </>
      ) : (hint.audience === 'followers' || hint.audience === 'organizations') && organization ? (
        <>
          <OrganizationBadge organization={organization} size="lg" className="mx-auto" />
          <h1 className="mt-3 font-extrabold font-head text-[1.25rem] text-ink">
            For {organization.name}'s members
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            This event is for people who have joined {organization.name}. Join to see it and say
            you're going.
          </p>
          <FollowButton
            following={follows.following.has(organization.id)}
            requested={follows.requested.has(organization.id)}
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
      {isPrivateAudience(hint.audience) ? null : <EventGroupCard eventId={eventId} />}
    </div>
  );
}
