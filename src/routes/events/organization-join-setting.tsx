import { useState } from 'react';
import { setJoinsNeedApproval } from '@/lib/organization-members';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';

/**
 * For its org admins and the club's administrators (the owner, 2026-10-31):
 * open to all, which is where every organization starts, or approved first.
 */
export function OrganizationJoinSetting({
  organizationId,
  needed,
  onChanged,
}: {
  organizationId: string;
  needed: boolean;
  onChanged: () => void;
}) {
  const { reload } = useOrganizations();
  const [on, setOn] = useState(needed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setBusy(true);
    setError(null);
    setOn(next);
    void setJoinsNeedApproval(organizationId, next).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      reload();
      onChanged();
    });
  }

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[0.9375rem] text-ink">Approve new members</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {on
              ? 'People ask to join, and become members when you approve them.'
              : 'Open to all: anybody can join right away.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Approve new members"
          data-target="small"
          disabled={busy}
          onClick={toggle}
          className={cn(
            'relative h-[30px] w-[52px] flex-none rounded-full transition-colors disabled:opacity-50',
            on ? 'bg-action hover:bg-action-hi' : 'bg-line hover:bg-grey',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] h-6 w-6 rounded-full bg-paper transition-[left]',
              on ? 'left-[25px]' : 'left-[3px]',
            )}
          />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
