import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { describeThrown } from '@/lib/describe-error';
import {
  type ConnectionGroup,
  connectMembers,
  defaultGroupName,
  fetchConnectionGroups,
  INTRODUCTION_NOTE_MAX,
} from '@/lib/introductions';
import { type MentionCandidate, suggestMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';
import { useConnectableMembers } from '@/routes/peers/connect-fields';

/**
 * Connecting members (the owner, 2026-11-06): two or more into a new group
 * they can name, or one or more into a group the connector already has. The
 * same form on a profile's Introduce sheet and on Stats & controls.
 */

const GROUP_NAME_MAX = 60;
/** Past this many groups, a search above the list. */
const GROUPS_BEFORE_SEARCH = 6;

type Where = 'new' | 'existing';

export interface Connected {
  /** "Ana, Bo and Cass are connected in “Saturday riders”." */
  summary: string;
  threadId: string;
  /** The connector is in the conversation, so it can be opened. */
  canOpen: boolean;
}

/** "Ana", "Ana and Bo", "Ana, Bo and Cass". */
export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function useConnectForm(locked?: { id: string; displayName: string }) {
  const members = useConnectableMembers();
  const [people, setPeople] = useState<MentionCandidate[]>([]);
  const [where, setWhere] = useState<Where>('new');
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<ConnectionGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [join, setJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // `reload` is read so a group just started is listed at once.
  useEffect(() => {
    let live = true;
    if (reload < 0) return;
    void fetchConnectionGroups().then((result) => {
      if (!live) return;
      if (result.ok) setGroups(result.value);
      else setGroupsError(result.error);
    });
    return () => {
      live = false;
    };
  }, [reload]);

  // The profile's member first, with whatever the members read knows of them.
  const lockedPerson = useMemo<MentionCandidate | null>(() => {
    if (!locked) return null;
    return (
      members?.find((m) => m.id === locked.id) ?? {
        id: locked.id,
        displayName: locked.displayName,
        username: '',
        photoPath: null,
        photoAlt: null,
      }
    );
  }, [locked, members]);
  const everyone = lockedPerson ? [lockedPerson, ...people] : people;
  const group = groups?.find((g) => g.id === groupId) ?? null;
  const fallbackName = defaultGroupName(everyone.map((p) => p.displayName));
  const alreadyIn = where === 'existing' && group?.mine === true;

  const missing =
    where === 'new' && everyone.length < 2
      ? everyone.length === 0
        ? 'Choose at least two people.'
        : 'Choose one more person.'
      : where === 'existing' && everyone.length < 1
        ? 'Choose who to add.'
        : where === 'existing' && !group
          ? 'Choose a group.'
          : note.trim() === ''
            ? 'Write a note to them.'
            : note.length > INTRODUCTION_NOTE_MAX
              ? 'Shorten the note.'
              : null;

  async function submit(): Promise<Connected | null> {
    if (busy || missing) return null;
    setBusy(true);
    setFailure(null);
    try {
      const result = await connectMembers({
        people: everyone.map((p) => p.id),
        note,
        join: alreadyIn ? false : join,
        groupId: where === 'existing' ? groupId : null,
        name,
      });
      if (!result.ok) {
        setFailure(result.error);
        return null;
      }
      const names = listNames(everyone.map((p) => p.displayName));
      const groupName = where === 'existing' ? (group?.name ?? '') : name.trim() || fallbackName;
      const done: Connected = {
        summary:
          where === 'existing'
            ? `${names} ${everyone.length === 1 ? 'was' : 'were'} added to “${groupName}”.`
            : `${names} are connected in “${groupName}”.`,
        threadId: result.value,
        canOpen: alreadyIn || join,
      };
      setPeople([]);
      setName('');
      setNote('');
      setJoin(false);
      setGroupId(null);
      setReload((n) => n + 1);
      return done;
    } catch (e) {
      setFailure(describeThrown(e, 'Could not connect them.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    members,
    lockedPerson,
    people,
    setPeople,
    everyone,
    where,
    setWhere,
    name,
    setName,
    fallbackName,
    groups,
    groupsError,
    groupId,
    setGroupId,
    group,
    alreadyIn,
    note,
    setNote,
    join,
    setJoin,
    busy,
    failure,
    missing,
    submit,
    actionLabel: busy ? 'Connecting…' : where === 'existing' ? 'Add to the group' : 'Connect them',
  };
}

export type ConnectForm = ReturnType<typeof useConnectForm>;

/** Everything above the button. */
export function ConnectFields({ form }: { form: ConnectForm }) {
  const twoOnly = form.where === 'new' && form.everyone.length === 2;
  return (
    <>
      <PeoplePicker form={form} />
      <WhereChoice form={form} />
      <NoteField
        form={form}
        label={twoOnly ? 'A note to both of them' : 'A note to everyone'}
        hint={
          form.where === 'existing'
            ? 'Why they might like to meet. Everyone in the group will read it, so leave out health details.'
            : twoOnly
              ? 'Why they might like to meet. Both will read it, so leave out health details.'
              : 'Why they might like to meet. They will all read it, so leave out health details.'
        }
      />
      {form.alreadyIn ? null : (
        <>
          <label className="mt-3 flex min-h-[44px] items-center gap-2.5 text-[0.9375rem] text-ink">
            <input
              type="checkbox"
              checked={form.join}
              onChange={(e) => {
                form.setJoin(e.target.checked);
              }}
              className="h-5 w-5 flex-none"
            />
            Join the conversation yourself
          </label>
          <p className="text-[0.8125rem] text-grey leading-[1.45]">
            {form.where === 'existing'
              ? form.join
                ? 'You will be added to the group too.'
                : 'You stay out of the group, and can still add people to it later.'
              : form.join
                ? 'A group opens right away, with a line saying you connected them, and your note. You will be in it too.'
                : 'A group opens right away, with a line saying you connected them, and your note. Only they will be in it, and you can add people to it later.'}
          </p>
        </>
      )}
      {form.failure ? (
        <p
          role="alert"
          className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.875rem] text-destructive leading-[1.45]"
        >
          {form.failure}
        </p>
      ) : null}
    </>
  );
}

/** What is still needed, under a button that cannot be pressed yet. */
export function ConnectMissing({ form, className }: { form: ConnectForm; className?: string }) {
  if (!form.missing) return null;
  return (
    <p role="status" className={cn('text-[0.8125rem] text-grey', className)}>
      {form.missing}
    </p>
  );
}

function PeoplePicker({ form }: { form: ConnectForm }) {
  const searchId = useId();
  const hintId = useId();
  const search = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState('');
  const query = typed.trim().replace(/^@/, '');
  const taken = new Set(form.everyone.map((p) => p.id));
  const offered =
    form.members && query !== ''
      ? suggestMentions(
          form.members.filter((m) => !taken.has(m.id)),
          query,
          8,
        )
      : [];

  return (
    <div className="mt-4">
      <label htmlFor={searchId} className="block font-bold text-[0.9375rem]">
        Who are you introducing?
      </label>
      <p id={hintId} className="mt-0.5 text-[0.8125rem] text-grey leading-[1.45]">
        {form.everyone.length === 0
          ? 'Search for each person and tap to add them.'
          : `${form.everyone.length} chosen. Add as many as you like.`}
      </p>
      {form.everyone.length > 0 ? (
        <ul aria-label="Chosen" className="mt-2 flex flex-wrap gap-1.5">
          {form.everyone.map((person) => (
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
              {person.id === form.lockedPerson?.id ? (
                <span className="pr-2" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${person.displayName}`}
                  onClick={() => {
                    form.setPeople(form.people.filter((p) => p.id !== person.id));
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
        placeholder={form.everyone.length === 0 ? 'Name or @username' : 'Add someone else'}
        className="mt-2 min-h-[48px] w-full rounded-[11px] border border-line bg-paper px-3 text-[1rem] text-ink"
      />
      {query !== '' && form.members !== null ? (
        offered.length > 0 ? (
          <ul aria-label="Members" className="mt-1.5 rounded-[11px] border border-line py-1">
            {offered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    form.setPeople([...form.people, m]);
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

function WhereChoice({ form }: { form: ConnectForm }) {
  const nameId = useId();
  const nameHintId = useId();
  const groupSearchId = useId();
  const [typed, setTyped] = useState('');
  const groups = form.groups ?? [];
  const words = typed.trim().toLowerCase();
  const shown = words ? groups.filter((g) => g.name.toLowerCase().includes(words)) : groups;

  return (
    <fieldset className="mt-5">
      <legend className="font-bold text-[0.9375rem]">Where should they meet?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(
          [
            ['new', 'New group', 'You name it'],
            ['existing', 'Existing group', 'One you have'],
          ] as const
        ).map(([value, title, detail]) => (
          <label
            key={value}
            className={cn(
              'flex min-h-[64px] cursor-pointer flex-col justify-center rounded-[12px] border-2 px-3 py-2',
              form.where === value ? 'border-emphasis bg-tint' : 'border-line bg-paper',
            )}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={`${nameId}-where`}
                value={value}
                checked={form.where === value}
                onChange={() => {
                  form.setWhere(value);
                }}
                className="h-[18px] w-[18px] flex-none"
              />
              <span className="font-bold text-[0.9375rem] text-ink">{title}</span>
            </span>
            <span className="mt-0.5 pl-[26px] text-[0.8125rem] text-grey">{detail}</span>
          </label>
        ))}
      </div>

      {form.where === 'new' ? (
        <div className="mt-3">
          <label htmlFor={nameId} className="block font-semibold text-[0.875rem] text-ink">
            Group name <span className="font-normal text-grey">(optional)</span>
          </label>
          <input
            id={nameId}
            value={form.name}
            maxLength={GROUP_NAME_MAX}
            aria-describedby={nameHintId}
            onChange={(e) => {
              form.setName(e.target.value);
            }}
            placeholder={form.fallbackName || 'Saturday riders'}
            className="mt-1.5 min-h-[48px] w-full rounded-[11px] border border-line bg-paper px-3 text-[1rem] text-ink"
          />
          <p id={nameHintId} className="mt-1 text-[0.8125rem] text-grey leading-[1.45]">
            {form.fallbackName ? `Leave it blank to call it “${form.fallbackName}”. ` : null}
            It is kept, so you can add people to it next time.
          </p>
        </div>
      ) : form.groups === null ? (
        <p className="mt-3 text-[0.875rem] text-grey">
          {form.groupsError ?? 'Loading your groups…'}
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-3 rounded-[11px] bg-tint px-3 py-2.5 text-[0.875rem] text-ink2 leading-[1.45]">
          You have no groups yet. A group you start here is kept, so you can add people to it next
          time.
        </p>
      ) : (
        <div className="mt-3">
          {groups.length > GROUPS_BEFORE_SEARCH ? (
            <>
              <label htmlFor={groupSearchId} className="sr-only">
                Search your groups
              </label>
              <input
                id={groupSearchId}
                type="search"
                autoComplete="off"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                }}
                placeholder="Search your groups"
                className="mb-2 min-h-[44px] w-full rounded-[11px] border border-line bg-paper px-3 text-[1rem] text-ink"
              />
            </>
          ) : null}
          <ul
            aria-label="Your groups"
            className="max-h-[260px] overflow-y-auto rounded-[12px] border border-line"
          >
            {shown.map((g) => (
              <li key={g.id} className="border-line border-b last:border-b-0">
                <label className="flex min-h-[52px] cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-tint">
                  <input
                    type="radio"
                    name={`${nameId}-group`}
                    checked={form.groupId === g.id}
                    onChange={() => {
                      form.setGroupId(g.id);
                    }}
                    className="h-[18px] w-[18px] flex-none"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-[0.9375rem] text-ink">{g.name}</span>
                    <span className="block text-[0.8125rem] text-grey">
                      {g.members === 1 ? '1 member' : `${g.members} members`} ·{' '}
                      {g.mine ? 'You’re in it' : 'You started it'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-[0.875rem] text-grey">No group matches that.</li>
            ) : null}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

function NoteField({ form, label, hint }: { form: ConnectForm; label: string; hint: string }) {
  const noteId = useId();
  const hintId = useId();
  const left = INTRODUCTION_NOTE_MAX - form.note.length;
  return (
    <>
      <label htmlFor={noteId} className="mt-5 block font-bold text-[0.9375rem]">
        {label}
      </label>
      <p id={hintId} className="mt-0.5 text-[0.8125rem] text-grey leading-[1.45]">
        {hint} {left >= 0 ? `${left} characters left.` : `${-left} characters over.`}
      </p>
      <textarea
        id={noteId}
        value={form.note}
        onChange={(e) => {
          form.setNote(e.target.value);
        }}
        aria-describedby={hintId}
        aria-invalid={left < 0 || undefined}
        rows={4}
        className="mt-1.5 w-full rounded-[11px] border border-line bg-paper px-3 py-2.5 text-[1rem] text-ink"
      />
    </>
  );
}
