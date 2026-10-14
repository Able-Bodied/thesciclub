import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { type JoiningSetting, setJoiningOpen } from '@/lib/joining';
import { cn } from '@/lib/utils';

/**
 * Invite only, or anybody can join (20261014000000). The owner, 2026-10-14:
 * open for a few weeks of events, so somebody met there can join on the spot,
 * and closed again afterwards.
 *
 * Opening asks first, because it lets strangers into a private club; closing
 * does not, because it only puts back what was always true. Either way the
 * sentence under the switch says what is true now, so a glance is enough.
 */

const SINCE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

export function joiningSummary(setting: JoiningSetting): string {
  if (!setting.open) {
    return 'Invite only. Somebody joins with an invite or not at all.';
  }
  const since = setting.changedAt
    ? ` since ${new Date(setting.changedAt).toLocaleDateString('en-US', SINCE)}`
    : '';
  return `Anybody can join${since}, with an email address, Google or Apple. Blocked addresses still cannot.`;
}

export function JoiningSection({
  setting,
  error,
  onChanged,
}: {
  setting: JoiningSetting | null;
  error: string | null;
  onChanged: () => void;
}) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function flip(current: JoiningSetting) {
    const opening = !current.open;
    if (
      opening &&
      !window.confirm(
        'Let anybody join?\n\nAnybody with the address can make an account and get in, without an invite, until you switch this off again.',
      )
    ) {
      return;
    }
    setBusy(true);
    setFailure(null);
    const result = await setJoiningOpen(opening);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    announce(opening ? 'Anybody can join now.' : 'Joining is invite only again.');
    onChanged();
  }

  return (
    <section
      aria-labelledby="who-can-join-heading"
      className={cn(
        'mt-4 rounded-[14px] border p-3.5',
        setting?.open ? 'border-gold-dp bg-gold-lt' : 'border-line bg-paper',
      )}
    >
      <h2
        id="who-can-join-heading"
        className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Who can join
      </h2>
      {setting === null ? (
        <p className="mt-1.5 text-[0.8125rem] text-grey leading-[1.45]">
          {error ?? 'Checking who can join…'}
        </p>
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={setting.open}
            disabled={busy}
            onClick={() => {
              void flip(setting);
            }}
            className="mt-1 flex min-h-[44px] w-full items-center justify-between gap-3 text-left disabled:opacity-50"
          >
            <span className="font-bold font-head text-[0.9375rem] text-ink">Anybody can join</span>
            {busy ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 flex-none animate-spin text-grey" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-11 flex-none items-center rounded-full p-0.5',
                  setting.open ? 'justify-end bg-action' : 'justify-start bg-grey',
                )}
              >
                <span className="h-5 w-5 rounded-full bg-white" />
              </span>
            )}
          </button>
          <p className="mt-1 text-[0.8125rem] text-ink leading-[1.5]">{joiningSummary(setting)}</p>
          <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
            For events, while you want people to join on the spot. Switching it off goes back to
            invites only; whoever joined meanwhile stays a member. Invites work either way.
          </p>
        </>
      )}
      {/* A failed re-read after a change leaves the last answer on screen,
          and says so. */}
      {(failure ?? (setting ? error : null)) ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure ?? error}
        </p>
      ) : null}
    </section>
  );
}
