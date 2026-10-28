import { cn } from '@/lib/utils';
import { AppleNotices } from '@/routes/admin/apple-notices';
import type { RenewalsRead } from '@/routes/admin/renewals';
import { RenewalsSection } from '@/routes/admin/renewals-section';
import { type AppleHealth, RENEW_WITHIN_DAYS } from '@/routes/admin/sign-in-health';

/**
 * Admin → Keys & renewals: whether Apple sign-in works (sign-in-health.ts
 * says what each state means), everything the club renews with the steps
 * (renewals-section.tsx; the Apple secret's are there), and Apple's notices.
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
  renewals,
  onRenewed,
}: {
  health: AppleHealth | null;
  renewals: Pick<RenewalsRead, 'renewals' | 'error'>;
  /** After a date is saved or an item added: read Apple and the list again. */
  onRenewed: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {health ? (
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
            {RENEW_WITHIN_DAYS} days before, again nearer the date, and every day after it until it
            is renewed. How to renew it is under Renewals, below.
          </p>
        </section>
      ) : (
        <p className="py-4 text-center text-[0.875rem] text-grey">Checking Apple sign-in…</p>
      )}

      <RenewalsSection read={renewals} onChanged={onRenewed} />

      <AppleNotices />
    </div>
  );
}
