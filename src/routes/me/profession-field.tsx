import { useEffect, useId, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { PARTNER_ROLE_NAME } from '@/lib/club-partners';
import { fetchMyPartnerCard, setMyProfessionalTitle } from '@/lib/partner-hub';

const MAX = 80;

/**
 * A verified professional writes the profession shown beside their name (the
 * owner, 2026-11-04; 20261104100000, 20261104160000): "Verified professional ·
 * Physical therapist, SCI-FIT". Nobody else does, not even when they are made one.
 */
export function ProfessionField() {
  const id = useId();
  const announce = useAnnounce();
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchMyPartnerCard().then((result) => {
      if (!live) return;
      if (result.ok && result.value) {
        setSaved(result.value.title ?? '');
        setDraft(result.value.title ?? '');
      } else if (!result.ok) setError(result.error);
    });
    return () => {
      live = false;
    };
  }, []);

  const clean = draft.trim();
  const changed = saved !== null && clean !== saved;
  const ready = changed && clean.length >= 2 && clean.length <= MAX;

  function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    void setMyProfessionalTitle(clean)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSaved(result.value);
        setDraft(result.value);
        announce('Your profession is saved.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (saved === null && !error) return null;

  return (
    <form
      className="mt-2.5 rounded-[17px] border border-line bg-paper p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label htmlFor={id} className="block font-extrabold font-head text-[0.96875rem] text-ink">
        Your profession
      </label>
      <p id={`${id}-hint`} className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
        {saved === '' ? 'You are a verified professional. Write your profession for members. ' : ''}
        Shown beside your name as “{PARTNER_ROLE_NAME} · {clean || 'your profession'}”.
      </p>
      {saved !== null ? (
        <>
          <input
            id={id}
            value={draft}
            maxLength={MAX}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Physical therapist, SCI-FIT"
            className="mt-2 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
          />
          {changed ? (
            <button
              type="submit"
              disabled={!ready || busy}
              className="mt-2 min-h-[44px] rounded-xl bg-action px-5 font-bold text-[0.875rem] text-white hover:bg-action-hi disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
