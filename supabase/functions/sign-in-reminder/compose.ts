/** What the renewal reminder says, kept apart from sending so it can be tested. */

/** A row of renewals_due (20261028200000); provider is set for the Apple secret only. */
export interface DueSecret {
  provider: string | null;
  name?: string | null;
  purpose?: string | null;
  steps?: string[] | null;
  expires_on: string;
  days_left: number;
}

export interface ReminderEmail {
  subject: string;
  text: string;
}

const NAMES: Record<string, string> = { apple: 'Sign in with Apple' };

/** "9 April 2027" from "2027-04-09", whatever the server's time zone. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function reminderEmail(due: DueSecret): ReminderEmail {
  if (due.provider !== 'apple') return renewalEmail(due);
  const name = NAMES[due.provider] ?? due.provider;
  const when = longDate(due.expires_on);
  const subject =
    due.days_left < 0
      ? `${name} has stopped working: renew it now`
      : due.days_left === 0
        ? `${name} stops working today`
        : `${name} stops working in ${due.days_left} day${due.days_left === 1 ? '' : 's'}`;
  const state =
    due.days_left < 0
      ? `Its secret ran out on ${when}, so nobody can sign in to The SCI Club with Apple until it is renewed.`
      : `Its secret runs out on ${when}. After that, nobody can sign in to The SCI Club with Apple.`;
  const text = [
    state,
    '',
    'To renew it (five minutes):',
    '1. On your computer, in the project folder: node scripts/apple-secret.mjs <path to your AuthKey_….p8>',
    '2. Supabase → Authentication → Sign In / Providers → Apple → paste it into Secret Key (for OAuth) → Save.',
    '3. The SCI Club → Admin → Keys & renewals → Sign in with Apple secret → enter the date the script printed → Save the date.',
    '',
    'You will get this email again on the next reminder day until the date is updated.',
  ].join('\n');
  return { subject, text };
}

/** Any other dated item: its own name, purpose and steps, from the list. */
function renewalEmail(due: DueSecret): ReminderEmail {
  const name = due.name ?? 'Something the club renews';
  const when = longDate(due.expires_on);
  const subject =
    due.days_left < 0
      ? `${name} has run out: renew it now`
      : due.days_left === 0
        ? `${name} runs out today`
        : `${name} runs out in ${due.days_left} day${due.days_left === 1 ? '' : 's'}`;
  const steps = [
    ...(due.steps ?? []),
    'The SCI Club → Admin → Keys & renewals → enter the date it now runs out → Save the date.',
  ].map((step, index) => `${index + 1}. ${step.replaceAll('`', '')}`);
  const text = [
    due.days_left < 0 ? `${name} ran out on ${when}.` : `${name} runs out on ${when}.`,
    ...(due.purpose ? ['', due.purpose.replaceAll('`', '')] : []),
    '',
    'To renew it:',
    ...steps,
    '',
    'You will get this email again on the next reminder day until the date is updated.',
  ].join('\n');
  return { subject, text };
}
