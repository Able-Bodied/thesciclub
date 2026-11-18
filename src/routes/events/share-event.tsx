import { Send } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { shareLinkInChat } from '@/lib/chat/shared-posts';
import { publicEventUrl } from '@/lib/event-audience';
import { siteOrigin } from '@/lib/site-origin';
import { ShareSheet } from '@/routes/chat/share-post';

/**
 * Share, small, across from Back at the top of an event or an organization
 * (the owner, 2026-11-02: "a subtle share icon like on topics"; 2026-11-03:
 * "send it to a contact or group, copy a link, or share elsewhere"). It opens
 * the sheet posts are shared with (share-post.tsx).
 */
function ShareButton({
  label,
  heading,
  title,
  url,
  linkNote,
  when,
  className,
}: {
  label: string;
  heading: string;
  title: string;
  url: string;
  linkNote: string;
  /** When an event is, on its own line under its name in the message. */
  when?: string | undefined;
  /** In place of the light-on-dark look of an event's or organization's header. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => {
          setOpen(true);
        }}
        className={
          className ??
          '-mt-2.5 -mr-2 inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full px-3 text-[#B9CADF] text-[0.8125rem] hover:bg-white/10'
        }
      >
        <Send
          aria-hidden="true"
          className={className ? 'h-[1.1em] w-[1.1em]' : 'h-[14px] w-[14px]'}
        />
        Share
      </button>
      {open
        ? createPortal(
            <ShareSheet
              heading={heading}
              what={title}
              link={url}
              elsewhere
              linkNote={linkNote}
              sendNote="It arrives as a message with its link."
              send={(to, authorId, line) =>
                shareLinkInChat(
                  { title: when ? `${title}\n${when}` : title, url },
                  to,
                  authorId,
                  line,
                )
              }
              onClose={() => {
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The event's public link: a member who opens it is taken to the members'
 * page (public-event/page.tsx), anybody else sees the public one.
 */
export function ShareEventButton({
  eventId,
  shortLink,
  title,
  when,
}: {
  eventId: string;
  shortLink: string | null;
  title: string;
  /**
   * "Sat, Nov 14 · 10:00am", said in the message itself (the owner,
   * 2026-11-08: "make it clear when it is"), so a store app without the
   * event's card, and a notification, say it too.
   */
  when?: string | undefined;
}) {
  return (
    <ShareButton
      label="Share this event"
      heading="Share event"
      title={title}
      url={publicEventUrl(eventId, shortLink)}
      linkNote="Anyone can open it and see the event. Members see it in the club."
      when={when}
    />
  );
}

/** An organization's page is the club's: whoever opens it signs in first. */
export function ShareOrganizationButton({ id, name }: { id: string; name: string }) {
  return (
    <ShareButton
      label="Share this organization"
      heading="Share organization"
      title={name}
      url={`${siteOrigin()}/events/organizations/${id}`}
      linkNote="Only members can open it. Anyone else is asked to sign in, or ask for an invite, and then sees it."
    />
  );
}

/**
 * A room's page (the owner, 2026-11-18: "a share link for rooms, so we can
 * share rooms with people"). Like an organization's, it is the club's: whoever
 * opens it signs in, or asks for an invite, first.
 */
export function ShareRoomButton({ id, name }: { id: string; name: string }) {
  return (
    <ShareButton
      label={`Share the room ${name}`}
      heading="Share room"
      title={name}
      url={`${siteOrigin()}/chat/rooms/${id}`}
      linkNote="Only members can open it. Anyone else is asked to sign in, or ask for an invite, and then sees it."
      className="inline-flex items-center gap-1 rounded-full border border-line px-[0.85em] py-[0.45em] font-bold font-head text-[0.75rem] text-emphasis leading-[1.3] transition-colors hover:bg-tint"
    />
  );
}
