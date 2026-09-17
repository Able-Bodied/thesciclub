import { EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { setShowInBrowse } from '@/routes/profile/details-api';

/**
 * Whether other members can find you, on the screen that tells you what the
 * club knows about you.
 *
 * ---------------------------------------------------------------------------
 * Why it is here and not only in Your details
 * ---------------------------------------------------------------------------
 * It was only in the details form, four fields below the fold, behind a Save.
 * That is a reasonable place to *set* it and a bad place to *find* it: a member
 * who hid themselves months ago and is wondering why nobody has been in touch
 * has no way to discover that they did, because Me said nothing about it. The
 * state is the point, so the state belongs on the screen about them.
 *
 * It writes immediately rather than waiting for a Save, because it is a switch
 * and not a form — see `setShowInBrowse`.
 *
 * And it is here and nowhere else. `/profile/details` carried it first, four
 * fields down behind a Save, which is where it was mistaken for part of
 * onboarding. `saveDetails` no longer writes `show_in_browse` at all, so a
 * details form opened before somebody hid themselves cannot put them back in
 * the deck when they press Save on a page that no longer shows the switch.
 *
 * Hidden is stated loudly. Being invisible is a thing a member chose, but it is
 * also the explanation for an empty inbox, and a quiet grey row would not
 * reach somebody who has forgotten.
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
            {showInBrowse ? 'Show me in the deck' : 'You are hidden from the deck'}
          </p>
          <p className="mt-0.5 text-[0.78125rem] text-ink2 leading-[1.45]">
            {showInBrowse
              ? 'Other members can find you in Peers. Turn this off and they cannot — you can still browse.'
              : 'No other member can find you in Peers. You can still browse, and events still work.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showInBrowse}
          aria-label="Show me in the deck"
          disabled={busy}
          onClick={toggle}
          className={cn(
            'relative h-[30px] w-[52px] flex-none rounded-full transition-colors disabled:opacity-50',
            showInBrowse ? 'bg-navy' : 'bg-line',
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
        <p className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">{error}</p>
      ) : null}
    </div>
  );
}
