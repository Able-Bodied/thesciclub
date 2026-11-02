import { useState } from 'react';
import { QrCode } from '@/components/qr-code';
import { isShortLink, setEventShortLink } from '@/lib/event-audience';

/** What was typed, as an address has it. */
function tidied(typed: string): string {
  return typed
    .toLowerCase()
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
        <span className="flex min-w-0 flex-1 items-center rounded-[10px] border-[1.6px] border-line bg-paper px-2.5">
          <span className="flex-none text-[0.8125rem] text-grey">thesciclub.com/e/</span>
          <input
            id="event-short-link"
            value={draft}
            maxLength={32}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="49ers"
            onChange={(e) => {
              setDraft(tidied(e.target.value));
              setError(null);
            }}
            className="min-h-[42px] w-full min-w-0 bg-transparent text-[0.875rem] text-ink outline-none"
          />
        </span>
        <button
          type="button"
          disabled={!changed || busy}
          onClick={save}
          className="min-h-[44px] flex-none rounded-[10px] bg-action px-3 font-bold text-[0.8125rem] text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
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
        <div className="mx-auto mt-2.5 w-full max-w-[240px]">
          <QrCode text={link} label={`QR code for ${title}`} />
        </div>
      ) : null}
    </>
  );
}
