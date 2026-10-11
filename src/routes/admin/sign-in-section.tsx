import { useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { cn } from '@/lib/utils';
import { SmallButton } from '@/routes/admin/controls';
import {
  type AppleHealth,
  defaultExpiry,
  RENEW_WITHIN_DAYS,
  renewAppleSecret,
  todayIso,
} from '@/routes/admin/sign-in-health';

/**
 * Apple sign-in, for an administrator: whether it works, when its secret runs
 * out, and how to renew it. See sign-in-health.ts for what each state means.
 *
 * The steps are written out in full every time rather than hidden behind a
 * link, because they are done twice a year and nobody remembers them.
 */

const LONG_DATE: Intl.DateTimeFormatOptions = {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', LONG_DATE);
}

/** One sentence for the state, said first so a glance is enough. */
export function appleSummary(health: AppleHealth): string {
  const { state, enabled, expiresOn, daysLeft } = health;
  if (state === 'inactive') {
    if (enabled === false) return 'Apple sign-in is switched off in Supabase.';
    return `Apple sign-in has stopped working: its secret ran out on ${longDate(expiresOn ?? '')}.`;
  }
  if (state === 'unknown') return 'Could not check Apple sign-in just now.';
  const days = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  if (state === 'renew-soon') {
    return `Apple sign-in works, but its secret runs out in ${days}, on ${longDate(expiresOn ?? '')}. Renew it now.`;
  }
  return `Apple sign-in works. Its secret runs out on ${longDate(expiresOn ?? '')}, in ${days}.`;
}

const TONE: Record<AppleHealth['state'], string> = {
  active: 'border-line bg-paper',
  'renew-soon': 'border-gold-dp bg-gold-lt',
  inactive: 'border-destructive/40 bg-destructive/5',
  unknown: 'border-line bg-paper',
};

export function SignInSection({
  health,
  onRenewed,
}: {
  health: AppleHealth | null;
  onRenewed: () => void;
}) {
  const announce = useAnnounce();
  const [expiresOn, setExpiresOn] = useState(() => defaultExpiry(todayIso()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!health) {
    return <p className="py-10 text-center text-[0.875rem] text-grey">Checking Apple sign-in…</p>;
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await renewAppleSecret(expiresOn);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce(`Saved. Apple sign-in now runs out on ${longDate(expiresOn)}.`);
    onRenewed();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <section
        aria-labelledby="apple-sign-in-heading"
        className={cn('rounded-[14px] border p-3.5', TONE[health.state])}
      >
        <h2
          id="apple-sign-in-heading"
          className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
        >
          Sign in with Apple
        </h2>
        <p className="mt-1.5 font-bold text-[0.9375rem] text-ink leading-[1.45]">
          {appleSummary(health)}
        </p>
        <p className="mt-1.5 text-[0.8125rem] text-ink2 leading-[1.5]">
          Apple makes the secret run out every six months. The owner gets an email{' '}
          {RENEW_WITHIN_DAYS} days before, again nearer the date, and every day after it until it is
          renewed.
        </p>
      </section>

      <section
        aria-labelledby="apple-renew-heading"
        className="rounded-[14px] border border-line bg-paper p-3.5"
      >
        <h2 id="apple-renew-heading" className="font-bold font-head text-[0.9375rem] text-ink">
          Renewing it
        </h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[0.8125rem] text-ink2 leading-[1.5]">
          <li>
            On your computer, in the project folder, run{' '}
            <code className="rounded bg-tint px-1 py-0.5 text-[0.78125rem] text-ink">
              node scripts/apple-secret.mjs
            </code>{' '}
            followed by the path to your <code>AuthKey_….p8</code> file. It prints the new secret
            and the date it runs out.
          </li>
          <li>
            In Supabase, open Authentication → Sign In / Providers → Apple, paste it into Secret Key
            (for OAuth), and save. Check Apple is switched on.
          </li>
          <li>Enter the date the script printed here, and save.</li>
        </ol>
        <label
          htmlFor="apple-expires-on"
          className="mt-3 block font-bold text-[0.8125rem] text-ink"
        >
          New secret runs out on
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id="apple-expires-on"
            type="date"
            value={expiresOn}
            onChange={(event) => {
              setExpiresOn(event.target.value);
            }}
            className="min-h-[44px] rounded-[10px] border-[1.6px] border-line bg-canvas px-3 text-[0.875rem] text-ink outline-none focus:border-emphasis"
          />
          <SmallButton
            disabled={busy || !expiresOn}
            onClick={() => {
              void save();
            }}
          >
            {busy ? 'Saving…' : 'Save the new date'}
          </SmallButton>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
