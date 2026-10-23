import { X } from 'lucide-react';
import { useId } from 'react';
import { useMyThreads } from '@/lib/chat/threads';
import { cn } from '@/lib/utils';
import type { EventAudience } from '@/types/domain';

/**
 * "Who can see it" on the event form (the owner, 2026-10-22; 20261022180000).
 *
 * One choice for the whole audience. Followers is offered only for an
 * organization's event. Groups lists the group chats the member is in: as
 * buttons while there are few, and as a list to add from once there are many
 * (the owner: "if there are a lot of groups to choose from, a drop down"),
 * with what is chosen shown above it, each with a way to take it back.
 */

export interface AudienceChoice {
  audience: EventAudience;
  groups: string[];
}

/** Past this many groups, a list to choose from rather than a button each. */
export const GROUP_BUTTONS_MAX = 6;

const CHOICES: { value: EventAudience; title: string; hint: string }[] = [
  {
    value: 'public',
    title: 'Anyone with the link',
    hint: "A public page; anyone can register. Who's going stays in the club.",
  },
  { value: 'club', title: 'Everyone in the club', hint: 'Members only.' },
  { value: 'followers', title: 'Followers', hint: 'Members who follow the organization.' },
  { value: 'groups', title: 'Chosen groups', hint: 'Members of the group chats you pick.' },
];

export function AudienceField({
  value,
  onChange,
  organizationName,
  labelClassName,
  hintClassName,
}: {
  value: AudienceChoice;
  onChange: (next: AudienceChoice) => void;
  /** Null when no organization hosts it: then there are no followers to choose. */
  organizationName: string | null;
  labelClassName: string;
  hintClassName: string;
}) {
  const id = useId();
  const { threads } = useMyThreads();
  const groups = threads
    .filter((thread) => thread.kind === 'group')
    .map((thread) => ({ id: thread.id, name: thread.name ?? 'Group' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set(value.groups);
  const many = groups.length > GROUP_BUTTONS_MAX;

  const choices = CHOICES.filter((choice) => choice.value !== 'followers' || organizationName);

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
      <legend className={labelClassName}>Who can see it</legend>
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
                onChange({ ...value, audience: choice.value });
              }}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-action)]"
            />
            <span className="min-w-0">
              <span className="block font-bold text-[0.9375rem] text-ink">
                {choice.value === 'followers' && organizationName
                  ? `Followers of ${organizationName}`
                  : choice.title}
              </span>
              <span className="block text-[0.8125rem] text-ink2 leading-[1.4]">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>

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
      <p className={hintClassName}>
        Only those who can see it can say they're going. Narrowing it later keeps who already said
        yes.
      </p>
    </fieldset>
  );
}

/** Whether the choice can be saved: groups needs at least one. */
export function audienceReady(choice: AudienceChoice): boolean {
  return choice.audience !== 'groups' || choice.groups.length > 0;
}
