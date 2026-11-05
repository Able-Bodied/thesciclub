import { useState } from 'react';
import { setCollectsRsvps } from '@/lib/organization-members';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';

/**
 * For its org admins and the club's administrators (the owner, 2026-11-01):
 * whether Going on events read from its own calendar is an RSVP to it. Those
 * made in the club always are. Without it, Going is only for the club
 * (2026-11-04).
 */
export function OrganizationRsvpSetting({
  organizationId,
  collects,
}: {
  organizationId: string;
  collects: boolean;
}) {
  const { reload } = useOrganizations();
  const [on, setOn] = useState(collects);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setBusy(true);
    setError(null);
    setOn(next);
    void setCollectsRsvps(organizationId, next).then((result) => {
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
    <div className="mt-4 rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[0.9375rem] text-ink">Collect RSVPs</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {on
              ? 'Going on events from your own calendar is an RSVP to you, as on those added here.'
              : 'Members can say they’re going to events from your own calendar, but only to each other: they’re told to check with you if you need an RSVP.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Collect RSVPs"
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
        <p role="alert" className="mt-2 text-[0.8125rem] text-danger-ink leading-[1.4]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
