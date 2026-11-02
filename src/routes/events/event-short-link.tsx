import { useState } from 'react';
import { ClubMark } from '@/components/club-mark';
import { QrCode } from '@/components/qr-code';
import { isShortLink, setEventShortLink } from '@/lib/event-audience';

const ADDRESS = 'thesciclub.com/e/';

/**
 * What was typed, as an address has it. A whole address pasted in comes down to
 * its last part, rather than to all its letters run together.
 */
export function tidied(typed: string): string {
  const lower = typed.toLowerCase();
  const at = lower.lastIndexOf(ADDRESS);
  return (at === -1 ? lower : lower.slice(at + ADDRESS.length))
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * An event's short link, thesciclub.com/e/49ers (the owner, 2026-11-01). Its
 * organizers choose it here, beside the link it shortens. Cleared and saved, it
 * is gone and the long address is the only one again.
 */
export function ShortLinkField({
  eventId,
  shortLink,
  onSaved,
  say,
}: {
  eventId: string;
  shortLink: string | null;
  onSaved: (link: string | null) => void;
  say: (words: string) => void;
}) {
  const [draft, setDraft] = useState(shortLink ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft !== (shortLink ?? '');

  const save = () => {
    if (draft && !isShortLink(draft)) {
      setError(
        'Use 2 to 32 letters, numbers or hyphens, starting and ending with a letter or number.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    void setEventShortLink(eventId, draft).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.value);
      say(result.value ? 'Short link saved' : 'Short link removed');
    });
  };

  return (
    <div className="mt-3 border-line border-t pt-3">
      <label htmlFor="event-short-link" className="block font-bold text-[0.8125rem] text-ink">
        Short link
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        {/* Nothing but what is typed in the box: the address inside it, and an
            example, read as text that would not delete (the owner, 2026-11-01). */}
        <input
          id="event-short-link"
          value={draft}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="event-short-link-address"
          onChange={(e) => {
            setDraft(tidied(e.target.value));
            setError(null);
          }}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-[10px] border-[1.6px] border-line bg-paper px-2.5 text-[1rem] text-ink"
        />
        <button
          type="button"
          disabled={!changed || busy}
          onClick={save}
          className="min-h-[44px] flex-none rounded-[10px] bg-action px-3 font-bold text-[0.8125rem] text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p
        id="event-short-link-address"
        className="mt-1.5 break-all text-[0.8125rem] text-ink2 leading-[1.4]"
      >
        {draft ? `${ADDRESS}${draft}` : `Type a word, such as 49ers, to make ${ADDRESS}49ers`}
      </p>
      {error ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger-ink leading-[1.4]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The short link as a QR code, for a flyer or a screen across a room. */
export function ShortLinkQr({ link, title }: { link: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((now) => !now);
        }}
        className="mt-2 min-h-[44px] w-full rounded-[10px] bg-tint px-3 font-bold text-[0.8125rem] text-emphasis"
      >
        {open ? 'Hide QR code' : 'Make a QR code'}
      </button>
      {open ? (
        // The club's colours around the code, never over it: a logo in the middle
        // would cost the error correction that keeps it readable.
        <figure className="mx-auto mt-2.5 w-full max-w-[280px] rounded-[20px] bg-[#102a4c] p-4 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <ClubMark size={40} className="h-10 w-10" />
            <span className="font-extrabold font-head text-[1.0625rem] text-white">
              The SCI Club
            </span>
          </div>
          <div className="mt-3 rounded-[14px] bg-white p-2">
            <QrCode text={link} label={`QR code for ${title}`} />
          </div>
          <figcaption className="mt-3">
            <span className="block font-bold text-[0.9375rem] text-white leading-[1.3]">
              {title}
            </span>
            <span className="mt-0.5 block break-all font-bold text-[#E4B84D] text-[0.8125rem]">
              {link.replace(/^https:\/\//, '')}
            </span>
          </figcaption>
        </figure>
      ) : null}
    </>
  );
}
