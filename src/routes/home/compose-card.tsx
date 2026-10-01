import { MessageCirclePlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HomeSegment } from '@/lib/home/types';

/**
 * The way to ask or share from Home: the mock's dashed card, first in the list.
 *
 * ---------------------------------------------------------------------------
 * A link to a screen, not a sheet and not a floating button
 * ---------------------------------------------------------------------------
 * The mock opens a compose sheet. Here it goes to /home/new, which picks the
 * kind and the room and hands over to the New topic screen: a question lives
 * in a room, so where it goes is the one thing to decide before writing it.
 * The mock also draws a floating "Post" button; there is none (HANDOFF.md "What Home is",
 * Departures). This card is the first thing in the list and does the job, and
 * two controls with one name read as a repeated control to a screen reader.
 *
 * Dashed, as the mock has it, because it is somewhere to put something rather
 * than something somebody put. From the Photos pill it opens on sharing.
 *
 * ---------------------------------------------------------------------------
 * The whole card is the target; the first line is the link's name
 * ---------------------------------------------------------------------------
 * As on the topic card: the link is stretched over the card, and the line
 * under it is read as ordinary text rather than as part of the name.
 *
 * No avatar. The mock puts the viewer's own there, which would be one more
 * read on Home for a picture of somebody they already know.
 */
export function ComposeCard({
  segment,
  linkState,
}: {
  segment: HomeSegment;
  /** Router state for /home/new, so its back link returns to this pill. */
  linkState: unknown;
}) {
  return (
    <div className="relative mb-[11px] flex items-center gap-3 rounded-[17px] border-[1.6px] border-line border-dashed bg-paper p-3.5">
      {/* Decorative: the words beside it say what it is. Sized in em so it
          grows with the text-size setting. */}
      <span
        aria-hidden="true"
        className="grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-full bg-tint text-navy"
      >
        <MessageCirclePlus className="h-[1.25em] w-[1.25em]" />
      </span>
      <span className="min-w-0 flex-1">
        <Link
          to={segment === 'photos' ? '/home/new?kind=share' : '/home/new'}
          state={linkState}
          className="block font-extrabold font-head text-[0.90625rem] text-ink leading-[1.3] after:absolute after:inset-0 after:rounded-[17px]"
        >
          Ask something, or share something
        </Link>
        <span className="mt-0.5 block text-[0.78125rem] text-grey leading-[1.45]">
          No question is too basic, too personal or too weird.
        </span>
      </span>
    </div>
  );
}
