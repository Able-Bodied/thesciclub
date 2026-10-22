import { useRef, useState } from 'react';
import { PhotoViewer } from '@/components/photo-viewer';
import { useSmallCopies } from '@/lib/chat/attachments';

/**
 * The photographs on a message or a post. Opened, one at a time, in
 * PhotoViewer (src/components/photo-viewer.tsx), which steps through them,
 * zooms, and is a dialog that gives focus back to the tile that opened it.
 *
 * ---------------------------------------------------------------------------
 * A grid of up to four, then the picture itself
 * ---------------------------------------------------------------------------
 * One photograph is drawn on its own, at its own shape, no wider than the
 * bubble and no taller than 20rem; two to four go two across as squares. Each
 * is a button that opens the full picture over the page, at the size it was
 * stored, which is the 1,600px the phone shrank it to — enough to read a
 * label on a box or see a wound properly, which is what these are for. The
 * grid is the same for the reader's own and for somebody else's.
 *
 * On Home, with `fill`, a single photograph is the full width of the card at
 * the mock's 400 by 260, cropped to it. Home supplies `onOpen` to go to
 * the topic; without it the full picture opens in the viewer.
 * Home is the one caller because a card on Home is a fixed width in a column
 * of cards, and a photograph at its own shape left half a card empty beside
 * it on a wide screen, next to two-photograph cards that filled theirs. A
 * bubble is the opposite: it is as wide as what it holds, so the three Chat
 * callers — a message, a post, a report on /admin — keep the default.
 *
 * No tile has a background (owner, 2026-09-23). The tint that used to sit
 * behind each one showed as a grey box around a single photograph that was
 * not the bubble's shape — a landscape picture in a letterbox — and as a
 * flash before every load. A photograph is drawn as itself.
 *
 * ---------------------------------------------------------------------------
 * Alt text
 * ---------------------------------------------------------------------------
 * Nobody is asked to describe a photograph on the way in — a chat is not the
 * place for a form — so the picture is announced as what it is, "Photograph N
 * of M from <name>", and the words beside it are the description. A member
 * who wants to say what is in the picture says so in the message, which is
 * what people do anyway.
 *
 * ---------------------------------------------------------------------------
 * A photograph that will not load is a gap, not a broken icon
 * ---------------------------------------------------------------------------
 * The URL is signed under the reader's own token, so a path the policy
 * refuses — or a file that has since been deleted — never gets a URL and is
 * not drawn. A tile that says "photograph" over nothing would be a lie about
 * what the reader can see.
 */
export function AttachmentGrid({
  paths,
  from,
  fill = false,
  onOpen,
  openLabel,
}: {
  paths: readonly string[];
  from: string;
  /** A single photograph fills the width, cropped. Home's cards only. */
  fill?: boolean;
  /** Home opens the containing topic; Chat keeps the full-picture viewer. */
  onOpen?: (() => void) | undefined;
  openLabel?: string | undefined;
}) {
  // Tiles draw the small copy; the viewer opens the photograph.
  const { small, full } = useSmallCopies(paths);
  const [open, setOpen] = useState<number | null>(null);
  // The tile that opened the viewer, so that closing it puts focus back
  // there. Held from the click rather than read from `document.activeElement`,
  // because Safari does not focus a button when it is clicked.
  const opener = useRef<HTMLButtonElement | null>(null);
  const shown = paths.filter((path) => small.has(path));

  if (shown.length === 0) return null;
  const single = shown.length === 1;
  const filled = fill && single;

  return (
    <>
      <div className={`mt-2 grid gap-1.5 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {shown.map((path, index) => (
          <button
            key={path}
            type="button"
            onClick={(event) => {
              if (onOpen) {
                onOpen();
                return;
              }
              opener.current = event.currentTarget;
              setOpen(index);
            }}
            aria-label={`Photograph ${index + 1} of ${shown.length} from ${from}. ${openLabel ?? 'Open it.'}`}
            className={`block overflow-hidden rounded-[10px] ${
              filled ? 'aspect-[400/260] w-full' : single ? 'w-fit max-w-full' : 'aspect-square'
            }`}
          >
            <img
              src={small.get(path)}
              alt=""
              loading="lazy"
              className={
                single && !filled
                  ? 'block h-auto max-h-[20rem] w-auto max-w-full'
                  : 'block h-full w-full object-cover'
              }
            />
          </button>
        ))}
      </div>
      {open !== null && shown[open] ? (
        <PhotoViewer
          url={full.get(shown[open]) ?? small.get(shown[open]) ?? ''}
          label={`Photograph ${open + 1} of ${shown.length} from ${from}`}
          title={`Photographs from ${from}`}
          index={open}
          count={shown.length}
          onStep={(to) => {
            setOpen(to);
          }}
          onClose={() => {
            setOpen(null);
            opener.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
