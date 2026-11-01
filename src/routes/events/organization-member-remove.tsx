import { useCallback, useState } from 'react';
import { type OrganizationMember, useReviewMember } from '@/lib/organization-members';

/**
 * For its org admins (the owner, 2026-10-31): nobody reviews a member of an
 * open organization, so this is how one is removed. It is a denial, with the
 * reason sent to them, and they appear under Denied to be let back in.
 */
export function OrganizationMemberRemove({
  organizationId,
  member,
  onRemoved,
}: {
  organizationId: string;
  member: OrganizationMember;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const done = useCallback(() => {
    setOpen(false);
    setReason('');
    onRemoved();
  }, [onRemoved]);
  const { review, error } = useReviewMember(organizationId, done);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-label={`Remove ${member.displayName}`}
        className="mb-1 ml-[calc(34px+0.625rem)] min-h-[32px] font-bold text-[0.78125rem] text-ink2 underline underline-offset-2"
        data-target="small"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="pb-3">
      <label htmlFor={`remove-${member.id}`} className="block font-bold text-[0.8125rem] text-ink">
        Why? {member.displayName} will read this.
      </label>
      <textarea
        id={`remove-${member.id}`}
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
        className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
          }}
          className="min-h-[44px] rounded-[11px] border-[1.6px] border-line font-bold text-[0.875rem] text-ink2"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={reason.trim() === ''}
          onClick={() => {
            void review(member.id, false, reason);
          }}
          className="min-h-[44px] rounded-[11px] bg-destructive font-bold text-[0.875rem] text-white disabled:opacity-50"
        >
          Remove and send
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
