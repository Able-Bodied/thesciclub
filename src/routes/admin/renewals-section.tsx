import { useState } from 'react';
import { BIRTHDAY_ORDER, DateFields } from '@/components/date-fields';
import { useAnnounce } from '@/lib/announce';
import { type DateParts, EMPTY_DATE_PARTS, partsFromIso, readDate } from '@/lib/date-parts';
import { cn } from '@/lib/utils';
import { SmallButton } from '@/routes/admin/controls';
import {
  addRenewal,
  RENEWAL_NAME_MAX,
  RENEWAL_PURPOSE_MAX,
  RENEWAL_STEP_MAX,
  RENEWAL_STEPS_MAX,
  type Renewal,
  type RenewalState,
  type RenewalsRead,
  renewalState,
  setRenewalDate,
} from '@/routes/admin/renewals';
import { defaultExpiry, RENEW_WITHIN_DAYS, todayIso } from '@/routes/admin/sign-in-health';

/**
 * The Renewals list on Admin → Keys & renewals: each thing the club must
 * renew, when, and how. The steps are written out in full every time, as the
 * Apple card's were, because each is done once a year or less.
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

const NEED_DATE = 'Add the month, day and year — the year in four digits.';

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** One sentence for the state, said first so a glance is enough. */
export function renewalSummary(renewal: Renewal, today: string): string {
  const { state, daysLeft } = renewalState(renewal, today);
  const when = longDate(renewal.expiresOn ?? '');
  const days = daysLeft ?? 0;
  switch (state) {
    case 'no-expiry':
      return 'No expiry.';
    case 'no-date':
      return 'Date not entered.';
    case 'expired':
      return `Ran out on ${when}, ${plural(-days)} ago. Renew it now.`;
    case 'renew-soon':
      return days === 0
        ? `Runs out today, ${when}. Renew it now.`
        : `Runs out in ${plural(days)}, on ${when}. Renew it now.`;
    case 'ok':
      return `Runs out on ${when}, in ${plural(days)}.`;
  }
}

/** As the Apple card: gold within 30 days, red once gone. */
const TONE: Record<RenewalState, string> = {
  ok: 'border-line bg-paper',
  'renew-soon': 'border-gold-dp bg-gold-lt',
  expired: 'border-destructive/40 bg-destructive/5',
  'no-date': 'border-line bg-paper',
  'no-expiry': 'border-line bg-paper',
};

const CODE = 'rounded bg-tint px-1 py-0.5 text-[0.78125rem] text-ink [overflow-wrap:anywhere]';

/** Text with `backticks` drawn as code, as the steps are written. */
export function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
          <code key={index} className={CODE}>
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function RenewalCard({
  renewal,
  today,
  onChanged,
}: {
  renewal: Renewal;
  today: string;
  onChanged: () => void;
}) {
  const announce = useAnnounce();
  const isApple = renewal.signInProvider === 'apple';
  const [parts, setParts] = useState<DateParts>(() =>
    isApple ? partsFromIso(defaultExpiry(today)) : EMPTY_DATE_PARTS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state } = renewalState(renewal, today);
  const reading = readDate(parts, { needs: 'day', future: true });
  const headingId = `renewal-${renewal.id}`;
  const dateLabelId = `${headingId}-date-label`;

  async function save() {
    if (reading.kind !== 'date') {
      // An invalid date is already said under the boxes.
      if (reading.kind !== 'invalid')
        setError(reading.kind === 'partial' ? reading.need : NEED_DATE);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setRenewalDate(renewal.id, reading.iso);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce(`Saved. ${renewal.name} now runs out on ${longDate(reading.iso)}.`);
    if (!isApple) setParts(EMPTY_DATE_PARTS);
    onChanged();
  }

  return (
    <section aria-labelledby={headingId} className={cn('rounded-[14px] border p-3.5', TONE[state])}>
      <h3 id={headingId} className="font-bold font-head text-[0.9375rem] text-ink">
        {renewal.name}
      </h3>
      <p className="mt-1 font-bold text-[0.9375rem] text-ink leading-[1.45]">
        {renewalSummary(renewal, today)}
      </p>
      {renewal.purpose ? (
        <p className="mt-1.5 text-[0.8125rem] text-ink2 leading-[1.5]">
          <WithCode text={renewal.purpose} />
        </p>
      ) : null}
      {renewal.steps.length > 0 || renewal.expires ? (
        <>
          <h4 className="mt-3 font-bold text-[0.8125rem] text-ink">
            {renewal.expires ? 'Renewing it' : 'Replacing it'}
          </h4>
          <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-[0.8125rem] text-ink2 leading-[1.5]">
            {renewal.steps.map((step, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: steps are kept in order and may repeat
              <li key={index}>
                <WithCode text={step} />
              </li>
            ))}
            {renewal.expires ? (
              <li>
                {isApple
                  ? 'Enter the date the script printed below, and save.'
                  : 'Enter the date it now runs out below, and save.'}
              </li>
            ) : null}
          </ol>
        </>
      ) : null}
      {renewal.expires ? (
        <div className="mt-3">
          <p id={dateLabelId} className="font-bold text-[0.8125rem] text-ink">
            {isApple
              ? 'New secret runs out on'
              : renewal.expiresOn
                ? 'New date it runs out'
                : 'Date it runs out'}
          </p>
          <div className="mt-1.5">
            <DateFields
              id={`${headingId}-date`}
              labelledBy={dateLabelId}
              order={BIRTHDAY_ORDER}
              parts={parts}
              reading={reading}
              onChange={(next) => {
                setParts(next);
                setError(null);
              }}
            />
          </div>
          <div className="mt-2.5">
            <SmallButton
              disabled={busy}
              onClick={() => {
                void save();
              }}
            >
              {busy ? 'Saving…' : 'Save the date'}
            </SmallButton>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const FIELD =
  'mt-1 min-h-[44px] w-full rounded-[11px] border border-line bg-paper px-3 py-2 font-normal text-[1rem] text-ink outline-none focus:border-emphasis';

function AddRenewal({ onAdded }: { onAdded: () => void }) {
  const announce = useAnnounce();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [steps, setSteps] = useState('');
  const [never, setNever] = useState(false);
  const [parts, setParts] = useState<DateParts>(EMPTY_DATE_PARTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = readDate(parts, { needs: 'day', future: true });

  async function add() {
    const lines = steps
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setError('Give it a name.');
      return;
    }
    if (lines.length > RENEWAL_STEPS_MAX || lines.some((l) => l.length > RENEWAL_STEP_MAX)) {
      setError(
        `Up to ${RENEWAL_STEPS_MAX} steps, each up to ${RENEWAL_STEP_MAX.toLocaleString('en-US')} characters.`,
      );
      return;
    }
    if (!never && reading.kind === 'invalid') return;
    if (!never && reading.kind === 'partial') {
      setError(reading.need);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await addRenewal({
      name: name.trim(),
      purpose: purpose.trim(),
      steps: lines,
      expires: !never,
      expiresOn: !never && reading.kind === 'date' ? reading.iso : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce(`Added ${name.trim()}.`);
    setName('');
    setPurpose('');
    setSteps('');
    setNever(false);
    setParts(EMPTY_DATE_PARTS);
    onAdded();
  }

  return (
    <section
      aria-labelledby="renewal-add-heading"
      className="rounded-[14px] border border-line bg-paper p-3.5"
    >
      <h2 id="renewal-add-heading" className="font-bold font-head text-[0.9375rem] text-ink">
        Add something to renew
      </h2>
      <form
        className="mt-2 grid gap-3 text-[0.8125rem]"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="font-bold text-ink">
          Name
          <input
            className={FIELD}
            maxLength={RENEWAL_NAME_MAX}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label className="font-bold text-ink">
          What it is for
          <textarea
            className={FIELD}
            rows={3}
            maxLength={RENEWAL_PURPOSE_MAX}
            value={purpose}
            onChange={(event) => {
              setPurpose(event.target.value);
            }}
          />
        </label>
        <label className="font-bold text-ink">
          How to renew it
          <span className="block font-normal text-grey">
            One step per line, in order. A command in `backticks` shows as code.
          </span>
          <textarea
            className={FIELD}
            rows={5}
            value={steps}
            onChange={(event) => {
              setSteps(event.target.value);
            }}
          />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 font-bold text-ink">
          <input
            type="checkbox"
            checked={never}
            onChange={(event) => {
              setNever(event.target.checked);
            }}
          />
          It never runs out
        </label>
        {never ? null : (
          <div>
            <p id="renewal-add-date-label" className="font-bold text-ink">
              Date it runs out
            </p>
            <DateFields
              id="renewal-add-date"
              labelledBy="renewal-add-date-label"
              hint="Leave it empty if you don't know it yet."
              order={BIRTHDAY_ORDER}
              parts={parts}
              reading={reading}
              onChange={setParts}
            />
          </div>
        )}
        <div>
          <SmallButton type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add it'}
          </SmallButton>
        </div>
        {error ? (
          <p role="alert" className="text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export function RenewalsSection({
  read,
  onChanged,
}: {
  read: Pick<RenewalsRead, 'renewals' | 'error'>;
  onChanged: () => void;
}) {
  const today = todayIso();
  return (
    <>
      <section aria-labelledby="renewals-heading" className="flex flex-col gap-3.5">
        <div>
          <h2 id="renewals-heading" className="font-bold font-head text-[1.0625rem] text-ink">
            Renewals
          </h2>
          <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
            Everything the club must renew, soonest first. The owner gets an email{' '}
            {RENEW_WITHIN_DAYS} days before each date, again nearer it, and every day after it until
            the new date is saved here.
          </p>
        </div>
        {read.error ? (
          <p role="alert" className="text-[0.8125rem] text-destructive leading-[1.45]">
            {read.error}
          </p>
        ) : read.renewals === null ? (
          <p className="text-[0.8125rem] text-grey">Reading the renewals…</p>
        ) : (
          read.renewals.map((renewal) => (
            <RenewalCard key={renewal.id} renewal={renewal} today={today} onChanged={onChanged} />
          ))
        )}
      </section>
      <AddRenewal onAdded={onChanged} />
    </>
  );
}
