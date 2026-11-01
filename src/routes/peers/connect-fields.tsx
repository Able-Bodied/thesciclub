import { useEffect, useId, useRef, useState } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { INTRODUCTION_NOTE_MAX } from '@/lib/introductions';
import { loadMentionCandidates, type MentionCandidate, suggestMentions } from '@/lib/mentions';

/** The pieces of connecting two members, on a profile's sheet and on Stats & controls. */

export function useConnectableMembers(): MentionCandidate[] | null {
  const [members, setMembers] = useState<MentionCandidate[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadMentionCandidates().then((found) => {
      if (live) setMembers(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return members;
}

/** Search a member by name or @username, or show who was chosen. */
export function MemberField({
  label,
  members,
  chosen,
  onChoose,
}: {
  label: string;
  /** Who may be chosen; null while they load. */
  members: MentionCandidate[] | null;
  chosen: MentionCandidate | null;
  onChoose: (member: MentionCandidate | null) => void;
}) {
  const searchId = useId();
  const search = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState('');
  const query = typed.trim().replace(/^@/, '');
  const offered = members && query !== '' ? suggestMentions(members, query, 8) : [];

  if (chosen) {
    return (
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
            onChoose(null);
            // After the input is back.
            setTimeout(() => search.current?.focus(), 0);
          }}
          className="min-h-[44px] rounded-lg px-3 font-semibold text-[0.875rem] text-emphasis hover:bg-tint"
          aria-label={`Change from ${chosen.displayName}`}
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <label htmlFor={searchId} className="block font-bold text-[0.9375rem]">
        {label}
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
          <ul aria-label="Members" className="mt-1.5 rounded-[11px] border border-line py-1">
            {offered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChoose(m);
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
  );
}

/** The note to both of them, and whether the connector is in the conversation. */
export function ConnectNote({
  note,
  onNote,
  join,
  onJoin,
}: {
  note: string;
  onNote: (note: string) => void;
  join: boolean;
  onJoin: (join: boolean) => void;
}) {
  const noteId = useId();
  const hintId = useId();
  const left = INTRODUCTION_NOTE_MAX - note.length;
  return (
    <>
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
          onNote(e.target.value);
        }}
        aria-describedby={hintId}
        aria-invalid={left < 0 || undefined}
        rows={4}
        className="mt-1.5 w-full rounded-[11px] border border-line bg-paper px-3 py-2.5 text-[1rem] text-ink"
      />
      <label className="mt-3 flex min-h-[44px] items-center gap-2.5 text-[0.9375rem] text-ink">
        <input
          type="checkbox"
          checked={join}
          onChange={(e) => {
            onJoin(e.target.checked);
          }}
          className="h-5 w-5 flex-none"
        />
        Join the conversation yourself
      </label>
      <p className="text-[0.8125rem] text-grey leading-[1.45]">
        A conversation opens right away, with a line saying you connected them, and your note.{' '}
        {join ? 'You will be in it too.' : 'Only the two of them will be in it.'}
      </p>
    </>
  );
}
