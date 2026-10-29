import { useState } from 'react';
import { cn } from '@/lib/utils';
import { setShowOnMap } from '@/routes/profile/details-api';

/**
 * "Show me on the map", beside Visible (the owner, 2026-10-25): whether this
 * member is counted in their city's bubble on the map (20261025020000). On by
 * default. Written at once, as DeckVisibility is, and moved back if it fails.
 */
export function MapVisibility({
  userId,
  showOnMap,
  onChange,
}: {
  userId: string;
  showOnMap: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !showOnMap;
    setBusy(true);
    onChange(next);
    void setShowOnMap(userId, next)
      .then((result) => {
        if (result.ok) {
          setError(null);
          return;
        }
        onChange(!next);
        setError(result.error ?? 'Could not change that.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="mt-2.5 rounded-[17px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-extrabold font-head text-[0.96875rem] text-ink">Show me on the map</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {showOnMap
              ? 'Other members see you counted at your ZIP code or city on the map — never your address.'
              : 'You are not counted on the map. Other members can still find you in Peers if you are visible.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showOnMap}
          aria-label="Show me on the map"
          data-target="small"
          disabled={busy}
          onClick={toggle}
          className={cn(
            'relative h-[30px] w-[52px] flex-none rounded-full transition-colors disabled:opacity-50',
            showOnMap ? 'bg-action hover:bg-action-hi' : 'bg-line hover:bg-grey',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] h-6 w-6 rounded-full bg-paper transition-[left]',
              showOnMap ? 'left-[25px]' : 'left-[3px]',
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
