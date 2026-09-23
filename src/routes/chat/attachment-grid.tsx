import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAttachmentUrls } from '@/lib/chat/attachments';

/**
 * The photographs on a message or a post, and the one-at-a-time view of them.
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
 * No tile has a background (owner, 2026-09-23). The tint that used to sit
 * behind each one showed as a grey box around a single photograph that was
 * not the bubble's shape — a landscape picture in a letterbox — and as a
 * flash before every load. A photograph is drawn as itself.
 *
 * ---------------------------------------------------------------------------
 * From one photograph to the next without going back
 * ---------------------------------------------------------------------------
 * When a message carries more than one, the open picture has a way to the
 * previous and the next: the arrow controls, the arrow keys, and a sideways
 * swipe. The label counts along ("2 of 4") so a screen reader knows it moved.
 * The ends do not wrap; the control at an end is disabled rather than hidden,
 * so the layout does not jump and a keyboard user is not left guessing.
 *
 * ---------------------------------------------------------------------------
 * The picture is a button, and the viewer closes three ways
 * ---------------------------------------------------------------------------
 * Tap, Enter or Space opens it; the close control, the backdrop and Escape all
 * close it. Members here drive with a switch, a head pointer or a keyboard as
 * often as a finger, and a viewer that closes only by tapping outside is a
 * trap for all three. The open picture takes focus so Escape reaches it.
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
export function AttachmentGrid({ paths, from }: { paths: readonly string[]; from: string }) {
  const urls = useAttachmentUrls(paths);
  const [open, setOpen] = useState<number | null>(null);
  const shown = paths.filter((path) => urls.has(path));

  if (shown.length === 0) return null;

  return (
    <>
      <div className={`mt-2 grid gap-1.5 ${shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {shown.map((path, index) => (
          <button
            key={path}
            type="button"
            onClick={() => {
              setOpen(index);
            }}
            aria-label={`Photograph ${index + 1} of ${shown.length} from ${from}. Open it.`}
            className={`block overflow-hidden rounded-[10px] ${
              shown.length === 1 ? 'w-fit max-w-full' : 'aspect-square'
            }`}
          >
            <img
              src={urls.get(path)}
              alt=""
              loading="lazy"
              className={
                shown.length === 1
                  ? 'block h-auto max-h-[20rem] w-auto max-w-full'
                  : 'block h-full w-full object-cover'
              }
            />
          </button>
        ))}
      </div>
      {open !== null && shown[open] ? (
        <Lightbox
          url={urls.get(shown[open]) ?? ''}
          label={`Photograph ${open + 1} of ${shown.length} from ${from}`}
          index={open}
          count={shown.length}
          onStep={(to) => {
            setOpen(to);
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

/** A sideways swipe of at least this many px, and more sideways than up, steps. */
const SWIPE_PX = 48;

function Lightbox({
  url,
  label,
  index,
  count,
  onStep,
  onClose,
}: {
  url: string;
  label: string;
  index: number;
  count: number;
  onStep: (to: number) => void;
  onClose: () => void;
}) {
  const hasPrevious = index > 0;
  const hasNext = index < count - 1;
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && hasPrevious) onStep(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onStep(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, onStep, index, hasPrevious, hasNext]);

  // 44px round controls in the same white-on-scrim as the close control,
  // clear of the picture's edges and of each other on a phone.
  const stepClass =
    'absolute top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-[4px] transition-colors hover:bg-white/30 disabled:opacity-30 disabled:hover:bg-white/15';

  return (
    // The backdrop is the third way out. It is a button so that it has a name
    // and a keyboard, not a div with an onClick.
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#0A1D36]/92 p-3"
      onTouchStart={(event) => {
        const t = event.touches[0];
        touch.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        const t = event.changedTouches[0];
        touch.current = null;
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0 && hasNext) onStep(index + 1);
        if (dx > 0 && hasPrevious) onStep(index - 1);
      }}
    >
      <button
        type="button"
        aria-label="Close the photograph"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <img
        // Keyed on the URL so a new photograph is a new element and takes
        // focus again, and so the old one is not shown stretched while the
        // next loads.
        key={url}
        src={url}
        alt={label}
        // Above the backdrop button, and focusable so Escape has somewhere to
        // land and a screen reader lands on the picture rather than on the
        // close control behind it.
        className="relative z-10 max-h-[92dvh] max-w-full rounded-[8px] object-contain shadow-[0_18px_48px_rgba(0,0,0,.5)]"
        ref={(element) => {
          element?.focus();
        }}
        tabIndex={-1}
      />
      <button
        type="button"
        aria-label="Close the photograph"
        onClick={onClose}
        className="absolute top-3 right-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-[4px] transition-colors hover:bg-white/30"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photograph"
            disabled={!hasPrevious}
            onClick={() => {
              onStep(index - 1);
            }}
            className={`${stepClass} left-3`}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next photograph"
            disabled={!hasNext}
            onClick={() => {
              onStep(index + 1);
            }}
            className={`${stepClass} right-3`}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
