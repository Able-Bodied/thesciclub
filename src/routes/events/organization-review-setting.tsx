import { useState } from 'react';
import { useOrganizations } from '@/lib/organizations';
import { setAnonymousReviews } from '@/lib/reviews';
import { cn } from '@/lib/utils';

/**
 * For its org admins and the club's administrators (the owner, 2026-10-31):
 * anonymous reviews are on until they turn them off.
 */
export function OrganizationReviewSetting({
  organizationId,
  allowed,
}: {
  organizationId: string;
  allowed: boolean;
}) {
  const { reload } = useOrganizations();
  const [on, setOn] = useState(allowed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setBusy(true);
    setError(null);
    setOn(next);
    void setAnonymousReviews(organizationId, next).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      reload();
    });
  }

  return (
    <div className="mt-2.5 rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[0.9375rem] text-ink">Allow anonymous reviews</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {on
              ? 'Members can review without showing you their name.'
              : 'New reviews show the name of whoever wrote them.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Allow anonymous reviews"
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
