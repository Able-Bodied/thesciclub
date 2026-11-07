import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { type MentionCandidate, suggestMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';

/**
 * Choosing members one by one: a search, and each one chosen shown as a chip
 * with a way to take them off. Introducing (connect-form.tsx) and an
 * invite-only event's list (audience-field.tsx).
 */
export function MemberChipsField({
  label,
  hint,
  members,
  chosen,
  onChange,
  lockedId,
  className,
}: {
  label: string;
  hint: string;
  /** Who may be chosen; null while they load. */
  members: MentionCandidate[] | null;
  chosen: MentionCandidate[];
  onChange: (chosen: MentionCandidate[]) => void;
  /** Shown first and cannot be taken off. */
  lockedId?: string | null;
  className?: string;
}) {
  const searchId = useId();
  const hintId = useId();
  const search = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState('');
  const query = typed.trim().replace(/^@/, '');
  const taken = new Set(chosen.map((p) => p.id));
  const offered =
    members && query !== ''
      ? suggestMentions(
          members.filter((m) => !taken.has(m.id)),
          query,
          8,
        )
      : [];

  return (
    <div className={cn('mt-4', className)}>
      <label htmlFor={searchId} className="block font-bold text-[0.9375rem]">
        {label}
      </label>
      <p id={hintId} className="mt-0.5 text-[0.8125rem] text-grey leading-[1.45]">
        {hint}
      </p>
      {chosen.length > 0 ? (
        <ul aria-label="Chosen" className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((person) => (
            <li
              key={person.id}
              className="flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-tint py-1 pr-1 pl-1"
            >
              <span aria-hidden="true" className="flex-none">
                <MemberAvatar
                  id={person.id}
                  displayName={person.displayName}
                  photoPath={person.photoPath}
                  photoAlt={person.photoAlt}
                  className="h-[30px] w-[30px] rounded-full text-[0.6875rem]"
                />
              </span>
              <span className="font-semibold text-[0.875rem] text-ink">{person.displayName}</span>
              {person.id === lockedId ? (
                <span className="pr-2" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${person.displayName}`}
                  onClick={() => {
                    onChange(chosen.filter((p) => p.id !== person.id));
                    search.current?.focus();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full text-grey hover:bg-line hover:text-ink"
                >
                  <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={search}
        id={searchId}
        type="search"
        autoComplete="off"
        value={typed}
        aria-describedby={hintId}
        onChange={(e) => {
          setTyped(e.target.value);
        }}
        placeholder={chosen.length === 0 ? 'Name or @username' : 'Add someone else'}
        className="mt-2 min-h-[48px] w-full rounded-[11px] border border-line bg-paper px-3 text-[1rem] text-ink"
      />
      {query !== '' && members !== null ? (
        offered.length > 0 ? (
          <ul aria-label="Members" className="mt-1.5 rounded-[11px] border border-line py-1">
            {offered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...chosen, m]);
                    setTyped('');
                    search.current?.focus();
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
