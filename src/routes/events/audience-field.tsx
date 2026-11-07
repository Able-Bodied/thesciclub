import { Lock, X } from 'lucide-react';
import { useId } from 'react';
import { MemberChipsField } from '@/components/member-chips-field';
import { useMyThreads } from '@/lib/chat/threads';
import type { MentionCandidate } from '@/lib/mentions';
import { cn } from '@/lib/utils';
import { useConnectableMembers } from '@/routes/peers/connect-fields';
import type { EventAudience } from '@/types/domain';

/**
 * "Who in the club sees it" on the event form (the owner, 2026-10-22;
 * 20261022180000).
 *
 * One choice for the whole audience. Anyone with the event's link can open
 * its page whatever is chosen (the owner, 2026-10-29; 20261029110000): the
 * link is how people are invited, so it is not a choice. Followers is offered only for an
 * organization's event. Groups lists the group chats the member is in: as
 * buttons while there are few, and as a list to add from once there are many
 * (the owner: "if there are a lot of groups to choose from, a drop down"),
 * with what is chosen shown above it, each with a way to take it back.
 *
 * Members of organizations and Invite only (the owner, 2026-11-06;
 * 20261106030000) are private: nobody else sees the event, even from its
 * link. Organizations lists the ones the organizer is an org admin of; an
 * old event for its host's followers reads as that one organization.
 *
 * An open organization lets anyone join, and so see it: the form says so
 * (the owner, 2026-11-06).
 */

export interface AudienceChoice {
  audience: EventAudience;
  groups: string[];
  organizations: string[];
  people: MentionCandidate[];
}

export const CLUB_AUDIENCE: AudienceChoice = {
  audience: 'club',
  groups: [],
  organizations: [],
  people: [],
};

/** An organization the event can be for; `open` when anyone may join it. */
export interface AudienceOrganization {
  id: string;
  name: string;
  open?: boolean;
}

/** The chosen organizations anyone can join, by name. */
export function openChosen(
  choice: AudienceChoice,
  organizations: AudienceOrganization[],
): string[] {
  if (choice.audience !== 'organizations') return [];
  return organizations
    .filter((o) => o.open === true && choice.organizations.includes(o.id))
    .map((o) => o.name);
}

function listed(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Past this many groups, a list to choose from rather than a button each. */
export const GROUP_BUTTONS_MAX = 6;

const CHOICES: { value: EventAudience; title: string; hint: string; private?: true }[] = [
  { value: 'club', title: 'Everyone in the club', hint: 'Members only.' },
  {
    value: 'organizations',
    title: 'Members of an organization',
    hint: 'Only people who have joined the ones you choose.',
    private: true,
  },
  { value: 'groups', title: 'Chosen groups', hint: 'Members of the group chats you pick.' },
  {
    value: 'people',
    title: 'Invite only',
    hint: 'Only the people you choose. Each is told they’re invited.',
    private: true,
  },
];

export function AudienceField({
  value,
  onChange,
  organizations,
  labelClassName,
  hintClassName,
}: {
  value: AudienceChoice;
  onChange: (next: AudienceChoice) => void;
  /** The organizations whose members may be chosen: those the organizer is an org admin of. */
  organizations: AudienceOrganization[];
  labelClassName: string;
  hintClassName: string;
}) {
  const id = useId();
  const members = useConnectableMembers();
  const { threads } = useMyThreads();
  const groups = threads
    .filter((thread) => thread.kind === 'group')
    .map((thread) => ({ id: thread.id, name: thread.name ?? 'Group' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set(value.groups);
  const many = groups.length > GROUP_BUTTONS_MAX;

  const choices = CHOICES.filter(
    (choice) => choice.value !== 'organizations' || organizations.length > 0,
  );
  const chosenOrganizations = new Set(value.organizations);
  const isPrivate = value.audience === 'organizations' || value.audience === 'people';
  const open = openChosen(value, organizations);

  function choose(audience: EventAudience) {
    // One organization to choose from: chosen with the option.
    const only = organizations.length === 1 ? organizations[0]?.id : undefined;
    onChange({
      ...value,
      audience,
      organizations:
        audience === 'organizations' && value.organizations.length === 0 && only
          ? [only]
          : value.organizations,
    });
  }

  function toggleOrganization(organizationId: string) {
    onChange({
      ...value,
      organizations: chosenOrganizations.has(organizationId)
        ? value.organizations.filter((o) => o !== organizationId)
        : [...value.organizations, organizationId],
    });
  }

  function toggle(groupId: string) {
    onChange({
      ...value,
      groups: chosen.has(groupId)
        ? value.groups.filter((g) => g !== groupId)
        : [...value.groups, groupId],
    });
  }

  return (
    <fieldset className="mt-5">
      <legend className={labelClassName}>Who in the club sees it</legend>
      <div className="mt-1.5 rounded-[14px] border border-line bg-paper px-3.5">
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex cursor-pointer items-start gap-3 border-line border-b py-3 last:border-b-0"
          >
            <input
              type="radio"
              name={`${id}-audience`}
              checked={value.audience === choice.value}
              onChange={() => {
                choose(choice.value);
              }}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-action)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-bold text-[0.9375rem] text-ink">
                {choice.value === 'organizations' && organizations.length === 1
                  ? `Members of ${organizations[0]?.name ?? ''}`
                  : choice.title}
                {choice.private ? (
                  <Lock
                    aria-hidden="true"
                    className="h-[13px] w-[13px] text-grey"
                    strokeWidth={2.4}
                  />
                ) : null}
              </span>
              <span className="block text-[0.8125rem] text-ink2 leading-[1.4]">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {value.audience === 'organizations' && organizations.length > 1 ? (
        <fieldset className="mt-3">
          <legend className="font-bold text-[0.8125rem] text-ink">
            Which organizations’ members
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                aria-pressed={chosenOrganizations.has(organization.id)}
                onClick={() => {
                  toggleOrganization(organization.id);
                }}
                className={cn(
                  'min-h-[40px] rounded-full border-[1.4px] px-3.5 font-bold font-head text-[0.8125rem]',
                  chosenOrganizations.has(organization.id)
                    ? 'border-emphasis bg-emphasis text-white'
                    : 'border-line bg-paper text-ink2',
                )}
              >
                {organization.name}
              </button>
            ))}
          </div>
          {value.organizations.length === 0 ? (
            <p className={hintClassName}>Choose at least one organization.</p>
          ) : null}
        </fieldset>
      ) : null}

      {value.audience === 'people' ? (
        <MemberChipsField
          className="mt-3"
          label="Who is invited"
          hint={
            value.people.length === 0
              ? 'Search for each person and tap to add them.'
              : `${value.people.length} invited. Add as many as you like.`
          }
          members={members}
          chosen={value.people}
          onChange={(people) => {
            onChange({ ...value, people });
          }}
        />
      ) : null}

      {value.audience === 'groups' ? (
        <div className="mt-3">
          {groups.length === 0 ? (
            <p className={hintClassName}>
              You are not in any group chats yet. Start one in Chat, then choose it here.
            </p>
          ) : many ? (
            <>
              {value.groups.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Chosen groups">
                  {groups
                    .filter((group) => chosen.has(group.id))
                    .map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          onClick={() => {
                            toggle(group.id);
                          }}
                          aria-label={`Take ${group.name} off`}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-emphasis px-3.5 font-bold font-head text-[0.8125rem] text-white"
                        >
                          {group.name}
                          <X className="h-[14px] w-[14px]" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
              <label
                htmlFor={`${id}-add-group`}
                className="mt-2.5 block font-bold text-[0.8125rem] text-ink"
              >
                Add a group
              </label>
              <select
                id={`${id}-add-group`}
                value=""
                onChange={(e) => {
                  if (e.target.value) toggle(e.target.value);
                }}
                className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none focus:border-emphasis"
              >
                <option value="">Choose a group</option>
                {groups
                  .filter((group) => !chosen.has(group.id))
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <fieldset>
              <legend className="sr-only">Groups</legend>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={chosen.has(group.id)}
                    onClick={() => {
                      toggle(group.id);
                    }}
                    className={cn(
                      'min-h-[40px] rounded-full border-[1.4px] px-3.5 font-bold font-head text-[0.8125rem]',
                      chosen.has(group.id)
                        ? 'border-emphasis bg-emphasis text-white'
                        : 'border-line bg-paper text-ink2',
                    )}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {groups.length > 0 && value.groups.length === 0 ? (
            <p className={hintClassName}>Choose at least one group.</p>
          ) : null}
        </div>
      ) : null}
      {open.length > 0 ? (
        <p className={hintClassName}>
          Anyone can join {listed(open)}, so anyone who joins will see this. Turn on approval for
          joins on {open.length === 1 ? 'its page' : 'their pages'} to keep it private.
        </p>
      ) : null}
      {isPrivate ? (
        <p className={hintClassName}>
          Private: nobody else sees it, in the app or from its link. Narrowing it later keeps who
          already said yes.
        </p>
      ) : (
        <p className={hintClassName}>
          Only those who see it can say they're going. Narrowing it later keeps who already said
          yes. Anyone you send its link to can open it and join the guest list.
        </p>
      )}
    </fieldset>
  );
}

/** Whether the choice can be saved: each list needs at least one. */
export function audienceReady(choice: AudienceChoice): boolean {
  switch (choice.audience) {
    case 'groups':
      return choice.groups.length > 0;
    case 'organizations':
      return choice.organizations.length > 0;
    case 'people':
      return choice.people.length > 0;
    default:
      return true;
  }
}

/** Whether two choices would save the same thing. */
export function sameAudience(a: AudienceChoice, b: AudienceChoice): boolean {
  const key = (c: AudienceChoice) =>
    [
      c.audience,
      c.groups.slice().sort().join(),
      c.organizations.slice().sort().join(),
      c.people
        .map((p) => p.id)
        .sort()
        .join(),
    ].join('|');
  return key(a) === key(b);
}
