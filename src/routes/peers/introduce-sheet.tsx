import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import { useDialogFocus } from '@/lib/dialog-focus';
import { INTRODUCTION_NOTE_MAX, makeIntroduction } from '@/lib/introductions';
import { loadMentionCandidates, type MentionCandidate, suggestMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';

/**
 * A trusted partner introduces the member whose profile this is to another
 * (20261029100000). The geometry and the ways out are BlockSheet's.
 */
export function IntroduceSheet({
  member,
  onCancel,
  onSent,
}: {
  member: { id: string; displayName: string };
  onCancel: () => void;
  onSent: () => void;
}) {
  const announce = useAnnounce();
  const titleId = useId();
  const searchId = useId();
  const noteId = useId();
  const hintId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  useDialogFocus(dialog, heading, onCancel);

  const [members, setMembers] = useState<MentionCandidate[] | null>(null);
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<MentionCandidate | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadMentionCandidates().then((found) => {
      if (live) setMembers(found.filter((m) => m.id !== member.id));
    });
    return () => {
      live = false;
    };
  }, [member.id]);

  const query = typed.trim().replace(/^@/, '');
  const offered = members && query !== '' ? suggestMentions(members, query, 8) : [];
  const left = INTRODUCTION_NOTE_MAX - note.length;
  const ready = chosen !== null && note.trim() !== '' && left >= 0;

  function send() {
    if (busy || !chosen) return;
    if (note.trim() === '') {
      setFailure('Write a note to both of them.');
      return;
    }
    setBusy(true);
    setFailure(null);
    makeIntroduction(member.id, chosen.id, note)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        announce(
          `Introduction sent. ${member.displayName} and ${chosen.displayName} will each be asked.`,
        );
        onSent();
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'Could not send the introduction.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close without introducing"
        tabIndex={-1}
        onClick={onCancel}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-[81] flex flex-col bg-paper text-ink',
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82dvh] lg:w-[520px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
        )}
      >
        <div className="flex-1 overflow-y-auto px-[18px] pt-5">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            Introduce {member.displayName}
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-ink2 leading-[1.5]">
            Both are asked. If both say yes, a conversation of the three of you opens, with your
            note first. Neither is told if the other says no.
          </p>

          {chosen ? (
            <div className="mt-4 flex items-center gap-2.5 rounded-[11px] border border-line px-3 py-2">
              <MemberAvatar
                id={chosen.id}
                displayName={chosen.displayName}
                photoPath={chosen.photoPath}
                photoAlt={chosen.photoAlt}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{chosen.displayName}</span>
                <span className="block text-[0.8125rem] text-grey">@{chosen.username}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setChosen(null);
                  // After the input is back.
                  setTimeout(() => search.current?.focus(), 0);
                }}
                className="min-h-[44px] rounded-lg px-3 font-semibold text-[0.875rem] text-emphasis hover:bg-tint"
                aria-label={`Change from ${chosen.displayName}`}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor={searchId} className="block font-bold text-[0.9375rem]">
                Introduce them to
              </label>
              <input
                ref={search}
                id={searchId}
                type="search"
                autoComplete="off"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                }}
                placeholder="Name or @username"
                className="mt-1.5 min-h-[48px] w-full rounded-[11px] border border-line bg-paper px-3 text-[1rem] text-ink"
              />
              {query !== '' && members !== null ? (
                offered.length > 0 ? (
                  <ul
                    aria-label="Members"
                    className="mt-1.5 rounded-[11px] border border-line py-1"
                  >
                    {offered.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setChosen(m);
                            setTyped('');
                          }}
                          className="flex min-h-[44px] w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-tint"
                        >
                          <span aria-hidden="true" className="flex-none">
                            <MemberAvatar
                              id={m.id}
                              displayName={m.displayName}
                              photoPath={m.photoPath}
                              photoAlt={m.photoAlt}
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold">{m.displayName}</span>
                            <span className="block text-[0.8125rem] text-grey">@{m.username}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p role="status" className="mt-1.5 text-[0.875rem] text-grey">
                    Nobody matches that.
                  </p>
                )
              ) : null}
            </div>
          )}

          <label htmlFor={noteId} className="mt-4 block font-bold text-[0.9375rem]">
            A note to both of them
          </label>
          <p id={hintId} className="mt-0.5 text-[0.8125rem] text-grey leading-[1.45]">
            Why they might like to meet. Both will read it, so leave out health details.{' '}
            {left >= 0 ? `${left} characters left.` : `${-left} characters over.`}
          </p>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            aria-describedby={hintId}
            aria-invalid={left < 0 || undefined}
            rows={4}
            className="mt-1.5 w-full rounded-[11px] border border-line bg-paper px-3 py-2.5 text-[1rem] text-ink"
          />

          {failure ? (
            <p
              role="alert"
              className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.875rem] text-destructive leading-[1.45]"
            >
              {failure}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || !ready}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send introduction'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
