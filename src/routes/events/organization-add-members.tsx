import { useState } from 'react';
import { addOrganizationMember } from '@/lib/organization-members';
import { MemberPicker } from '@/routes/chat/member-picker';

/**
 * For its org admins and the club's administrators (the owner, 2026-10-30):
 * the same as adding somebody to the members' group chat, here because a club
 * administrator is not in that chat. Closed until asked for: the picker is
 * every member of the club.
 */
export function OrganizationAddMembers({
  organizationId,
  exclude,
  onAdded,
}: {
  organizationId: string;
  /** Who is already a member. */
  exclude: ReadonlySet<string>;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="mt-2.5 flex min-h-[46px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
      >
        Add members
      </button>
    );
  }

  function add() {
    if (picked.length === 0 || adding) return;
    setAdding(true);
    setFailure(null);
    // As in a group: one at a time, stopping at the first refusal, and the
    // list above says who arrived.
    void (async () => {
      for (const memberId of picked) {
        const result = await addOrganizationMember(organizationId, memberId);
        if (!result.ok) {
          setFailure(result.error);
          break;
        }
      }
      setPicked([]);
      setAdding(false);
      onAdded();
    })();
  }

  return (
    <div className="mt-2.5">
      <p className="text-[0.8125rem] text-ink2 leading-[1.45]">
        They become members straight away and join the members' group chat.
      </p>
      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}
      <MemberPicker
        picked={picked}
        onToggle={(memberId) => {
          setPicked((current) =>
            current.includes(memberId)
              ? current.filter((id) => id !== memberId)
              : [...current, memberId],
          );
        }}
        exclude={exclude}
        label="Add somebody"
        emptyNote="Everybody in the club is already a member."
      />
      {picked.length > 0 ? (
        <button
          type="button"
          onClick={add}
          disabled={adding}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {adding
            ? 'Adding…'
            : `Add ${picked.length} ${picked.length === 1 ? 'member' : 'members'}`}
        </button>
      ) : null}
    </div>
  );
}
