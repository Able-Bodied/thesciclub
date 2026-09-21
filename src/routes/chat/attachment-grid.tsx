import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAttachmentUrls } from '@/lib/chat/attachments';

/**
 * The photographs on a message or a post, and the one-at-a-time view of them.
 *
 * ---------------------------------------------------------------------------
 * A grid of up to four, then the picture itself
 * ---------------------------------------------------------------------------
 * One photograph is drawn on its own, as wide as the bubble; two to four go
 * two across. Each is a button that opens the full picture over the page, at
 * the size it was stored, which is the 1,600px the phone shrank it to — enough
 * to read a label on a box or see a wound properly, which is what these are
 * for. The grid is the same for the reader's own and for somebody else's.
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
            className={`block overflow-hidden rounded-[10px] bg-tint ${
              shown.length === 1 ? 'max-h-[20rem]' : 'aspect-square'
            }`}
          >
            <img
              src={urls.get(path)}
              alt=""
              loading="lazy"
              className={`block h-full w-full ${shown.length === 1 ? 'object-contain' : 'object-cover'}`}
            />
          </button>
        ))}
      </div>
      {open !== null && shown[open] ? (
        <Lightbox
          url={urls.get(shown[open]) ?? ''}
          label={`Photograph ${open + 1} of ${shown.length} from ${from}`}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

function Lightbox({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    // The backdrop is the third way out. It is a button so that it has a name
    // and a keyboard, not a div with an onClick.
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0A1D36]/92 p-3">
      <button
        type="button"
        aria-label="Close the photograph"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <img
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
    </div>
  );
}
