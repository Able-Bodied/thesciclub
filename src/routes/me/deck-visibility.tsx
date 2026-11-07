import { EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { setShowInBrowse } from '@/routes/profile/details-api';

/**
 * Whether other members can find you, on Me, the screen about you. Only here: buried in the
 * details form, a member who hid long ago could not find out why nobody gets in touch.
 * `saveDetails` no longer writes `show_in_browse`, so a stale details form cannot unhide them.
 * Writes at once, as a switch (see `setShowInBrowse`). Hidden is shown loudly, since it explains
 * an empty inbox. "Visibility", not "the deck" (the owner's wording; members see "Peers").
 */
export function DeckVisibility({
  userId,
  showInBrowse,
  onChange,
}: {
  userId: string;
  showInBrowse: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !showInBrowse;
    setBusy(true);
    // Optimistic, then corrected. The switch has to move under the finger; a
    // toggle that waits on a round trip reads as broken and gets pressed twice.
    onChange(next);
    void setShowInBrowse(userId, next)
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
    <div
      className={cn(
        'mt-2.5 rounded-[17px] border p-3.5',
        showInBrowse ? 'border-line bg-paper' : 'border-gold bg-gold-lt',
      )}
    >
      <div className="flex items-center gap-3.5">
        {showInBrowse ? null : <EyeOff className="h-5 w-5 flex-none text-gold-dp" />}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold font-head text-[0.96875rem] text-ink">
            {showInBrowse ? 'Visible' : 'Hidden'}
          </p>
          {/* "Visible" alone leaves the question of to whom. */}
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {showInBrowse
              ? 'Other members can find you in Peers.'
              : 'Other members cannot find you in Peers.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showInBrowse}
          aria-label="Change your visibility"
          data-target="small"
          disabled={busy}
          onClick={toggle}
          className={cn(
            'relative h-[30px] w-[52px] flex-none rounded-full transition-colors disabled:opacity-50',
            showInBrowse ? 'bg-action hover:bg-action-hi' : 'bg-line hover:bg-grey',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] h-6 w-6 rounded-full bg-paper transition-[left]',
              showInBrowse ? 'left-[25px]' : 'left-[3px]',
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
