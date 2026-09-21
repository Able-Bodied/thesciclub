import { useMemo, useState } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { useBrowseMembers } from '@/lib/members';

/**
 * Picking members — for a new group, and for adding to one that exists.
 *
 * ---------------------------------------------------------------------------
 * It reads browse_members, and that is the same rule the database applies
 * ---------------------------------------------------------------------------
 * `chat_is_findable()` admits a member who is active and in the directory, and
 * `browse_members` is the projection of exactly those people. So the list here
 * cannot offer somebody the database will then refuse, and a member who has
 * turned themselves off the deck is not in it — which is the whole point of
 * that setting and is why their name still shows on everything they wrote.
 *
 * Seeded directory rows are offered like anybody else. They are real people the
 * club has vouched for; whether a group chat reaches them is a question about
 * the club, not about this screen.
 *
 * ---------------------------------------------------------------------------
 * The filter is a filter, not a search
 * ---------------------------------------------------------------------------
 * It narrows the list that is already on screen by name, on the client, with no
 * request behind it. Chat has no search and this is not one arriving by the
 * side door: a box that quietly asks the server something is the control
 * CHAT-PLAN.md rules out, and this one cannot find anybody who is not already
 * drawn below it.
 *
 * The rows are checkboxes rather than buttons with a tick drawn on them. A
 * member using a switch or a head pointer gets the platform's own control, its
 * focus ring and its announced state, and the whole row is the label so the
 * target is the row and not the box.
 */
export function MemberPicker({
  picked,
  onToggle,
  exclude,
  label,
  emptyNote,
}: {
  picked: readonly string[];
  onToggle: (memberId: string) => void;
  /** Ids to leave out: the viewer, and anybody already in the group. */
  exclude: ReadonlySet<string>;
  label: string;
  /** What to say when nobody is left to offer. */
  emptyNote: string;
}) {
  const { members, loading, error } = useBrowseMembers();
  const [filter, setFilter] = useState('');

  const offered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return members
      .filter((member) => !exclude.has(member.id))
      .filter((member) => needle === '' || member.displayName.toLowerCase().includes(needle));
  }, [members, exclude, filter]);

  const chosen = new Set(picked);

  if (loading) {
    return <p className="py-8 text-center text-[0.875rem] text-grey">Loading the members…</p>;
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-[0.875rem] text-ink2 leading-relaxed">Could not load the members.</p>
        <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
      </div>
    );
  }

  return (
    <>
      <label
        htmlFor="member-filter"
        className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
      >
        {label}
      </label>
      <input
        id="member-filter"
        type="text"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        placeholder="Narrow the list by name"
        className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
      />

      {offered.length === 0 ? (
        <p className="py-8 text-center text-[0.875rem] text-grey leading-relaxed">
          {filter.trim() === '' ? emptyNote : `Nobody here is called “${filter.trim()}”.`}
        </p>
      ) : (
        // Bounded and scrolling, rather than as long as the club is. The button
        // that acts on this list sits below it, and a member should not have to
        // scroll past two dozen people to reach the thing they came to press —
        // which is worse here than anywhere, where scrolling may be a mouth
        // stick or a head pointer. In `em`, so it grows with the text size
        // instead of cropping more rows at `larger`. Eighteen shows five or six
        // people and still leaves the button and its sentence on screen.
        <div className="mt-2.5 max-h-[18em] overflow-y-auto rounded-[14px] border border-line bg-paper px-3.5">
          {offered.map((member) => {
            const level = member.exactLevel ?? member.levelRange;
            return (
              // The row is the label, so the whole of it is the target — a
              // 44px box on the right of a list is a miss for anybody aiming
              // with a mouth stick.
              <label
                key={member.id}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-line border-b py-2.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(member.id)}
                  onChange={() => {
                    onToggle(member.id);
                  }}
                  className="h-[22px] w-[22px] flex-none accent-navy"
                />
                <span aria-hidden="true" className="flex-none">
                  <MemberAvatar
                    id={member.id}
                    displayName={member.displayName}
                    photoPath={member.photoPath}
                    photoAlt={member.photoAlt}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
                    {member.displayName}
                  </span>
                  <span className="block text-[0.71875rem] text-grey">
                    {[level, member.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
