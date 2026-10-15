import { useState } from 'react';
import {
  type ClubStats,
  type OnboardingStepKey,
  PERIODS,
  periodPhrase,
  type StatsPeriod,
  useClubStats,
  weekLabel,
} from '@/routes/admin/club-stats';
import { SmallButton } from '@/routes/admin/controls';

/**
 * Admin → Stats: how many members use the club and what they do there.
 *
 * Counts, never names. The club is small enough that "which three opened the
 * app" would be a list of people, and the point of this tab is to see whether
 * the club is working, not to watch anyone in it. See club-stats.ts.
 */

const HEADING = 'font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';
const CARD = 'rounded-[14px] border border-line bg-paper';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "80%": of the step before. */
function percent(n: number, of: number): string {
  return `${Math.round((n / of) * 100)}%`;
}

function Tile({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return (
    <div className={`${CARD} px-3.5 py-3`}>
      <p className="text-[0.75rem] text-grey leading-[1.35]">{label}</p>
      <p className="mt-1 font-display font-extrabold text-[1.625rem] text-ink leading-none">
        {value ?? '—'}
      </p>
      <p className="mt-1.5 text-[0.75rem] text-ink2 leading-[1.35]">{detail}</p>
    </div>
  );
}

function Summary({ stats }: { stats: ClubStats }) {
  const of = `of ${plural(stats.members, 'member')}`;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Tile
        label={stats.period === 'all' ? 'Ever signed in' : 'Opened the app'}
        value={stats.opened}
        detail={stats.opened === null ? 'Not kept for an earlier period' : of}
      />
      <Tile label="New members" value={stats.joined} detail={`${stats.members} members now`} />
      <Tile
        label="Active members"
        value={stats.active}
        detail="Asked, replied, messaged or RSVPed"
      />
      <Tile
        label="Questions"
        value={stats.questions}
        detail={`${plural(stats.replies, 'reply', 'replies')}, ${plural(stats.messages, 'message')}, ${plural(stats.rsvps, 'RSVP')}`}
      />
    </div>
  );
}

/**
 * Two numbers, and the rest behind a button (the owner, 2026-10-15): the
 * funnel, each step and each part of a profile are for when something looks
 * wrong, not for every visit.
 */
function Joining({ stats }: { stats: ClubStats }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>Joining</h3>
      <div className={`${CARD} mt-2 px-3.5 py-3`}>
        <dl className="grid grid-cols-2 gap-x-3">
          <div>
            <dt className="text-[0.75rem] text-grey">Onboarding starts</dt>
            <dd className="font-extrabold font-head text-[1.375rem] text-ink">{stats.signedIn}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] text-grey">New accounts</dt>
            <dd className="font-extrabold font-head text-[1.375rem] text-ink">{stats.accounts}</dd>
          </div>
        </dl>
        <div className="mt-2.5">
          <SmallButton
            aria-expanded={open}
            aria-controls="onboarding-details"
            onClick={() => {
              setOpen((was) => !was);
            }}
          >
            {open ? 'Hide onboarding details' : 'Onboarding details'}
          </SmallButton>
        </div>
      </div>
      {open ? (
        <div id="onboarding-details">
          <Funnel stats={stats} />
          <Steps stats={stats} />
          <Profiles stats={stats} />
        </div>
      ) : null}
    </>
  );
}

function Funnel({ stats }: { stats: ClubStats }) {
  const unconfirmed = stats.accounts - stats.signedIn;
  const stopped = stats.signedIn - stats.reachedHome;
  const steps = [
    { label: 'Started onboarding', value: stats.signedIn, of: null },
    { label: 'Reached the home screen', value: stats.reachedHome, of: stats.signedIn },
    { label: 'Notifications on', value: stats.notificationsOn, of: stats.reachedHome },
  ];
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>How far they got</h3>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        Accounts made {periodPhrase(stats.period)}.
      </p>
      <div className={`${CARD} mt-2 px-3.5 py-3`}>
        <ol className="grid grid-cols-3 gap-x-3">
          {steps.map((step) => (
            <li key={step.label}>
              <span className="block font-extrabold font-head text-[1.125rem] text-ink">
                {step.value}
                {step.of ? (
                  <span className="ml-1 font-normal font-sans text-[0.75rem] text-grey">
                    {percent(step.value, step.of)}
                  </span>
                ) : null}
              </span>
              <span className="block text-[0.75rem] text-grey leading-[1.3]">{step.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.75rem] text-ink2 leading-[1.45]">
          {stopped > 0
            ? `${plural(stopped, 'person', 'people')} signed in and stopped before Home. `
            : ''}
          {unconfirmed > 0
            ? `${plural(unconfirmed, 'person', 'people')} filled in the join form but never pressed the link in the confirmation email.`
            : 'Nobody is stuck waiting on a confirmation email.'}
        </p>
      </div>
    </>
  );
}

const STEP_ROWS: { key: OnboardingStepKey; label: string }[] = [
  { key: 'agree', label: 'Got past the invite check' },
  { key: 'name', label: 'Name' },
  { key: 'username', label: 'Username' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'injury', label: 'Injury or condition' },
  { key: 'city', label: 'Location' },
  { key: 'phone', label: 'Phone number' },
  { key: 'photo', label: 'Profile picture' },
];

/** A labelled count with a bar, as a share of `of`. */
function BarRow({ label, value, of }: { label: string; value: number; of: number }) {
  const share = of ? Math.round((value / of) * 100) : 0;
  return (
    <li className="border-line border-b py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="text-ink">{label}</span>
        <span className="shrink-0 tabular-nums">
          <b className="font-extrabold font-head text-ink">{value}</b>
          {of ? <span className="ml-1.5 text-grey">{share}%</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tint" aria-hidden="true">
        <div className="h-full rounded-full bg-gold" style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}

function Steps({ stats }: { stats: ClubStats }) {
  const since = stats.stepsSince
    ? new Date(stats.stepsSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null;
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>Step by step</h3>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        Of the accounts made {periodPhrase(stats.period)}, how many reached each step of onboarding.{' '}
        {since ? `Kept since ${since}; earlier accounts have no steps.` : 'Nothing kept yet.'}
      </p>
      <ul className={`${CARD} mt-2 px-3.5 py-1`}>
        {STEP_ROWS.map((row) => (
          <BarRow
            key={row.key}
            label={row.label}
            value={stats.steps[row.key]}
            of={stats.steps.agree}
          />
        ))}
      </ul>
    </>
  );
}

const PROFILE_ROWS: { key: keyof ClubStats['profile']; label: string }[] = [
  { key: 'username', label: 'Created a username' },
  { key: 'birthday', label: 'Added a birthday' },
  { key: 'injury', label: 'Added their injury or condition' },
  { key: 'location', label: 'Added a location' },
  { key: 'phone', label: 'Added a phone number' },
  { key: 'photo', label: 'Added a profile picture' },
  { key: 'notifications', label: 'Turned on notifications' },
];

function Profiles({ stats }: { stats: ClubStats }) {
  const of = stats.reachedHome;
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>Profiles</h3>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        Of the {plural(of, 'member')} who joined {periodPhrase(stats.period)}, how many added each.
        Step by step, above, shows where people stop.
      </p>
      <ul className={`${CARD} mt-2 px-3.5 py-1`}>
        {PROFILE_ROWS.map((row) => (
          <BarRow key={row.key} label={row.label} value={stats.profile[row.key]} of={of} />
        ))}
      </ul>
    </>
  );
}

const COLUMNS: { key: keyof Omit<ClubStats['weeks'][number], 'week'>; label: string }[] = [
  { key: 'people', label: 'Active' },
  { key: 'joined', label: 'Joined' },
  { key: 'questions', label: 'Questions' },
  { key: 'replies', label: 'Replies' },
  { key: 'messages', label: 'Messages' },
  { key: 'rsvps', label: 'RSVPs' },
];

function Weeks({ stats }: { stats: ClubStats }) {
  const newestFirst = [...stats.weeks].reverse();
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>The last eight weeks</h3>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        Week by week, whatever the period.
      </p>
      <div className={`${CARD} mt-2 overflow-x-auto`}>
        <table className="w-full min-w-[520px] text-[0.8125rem]">
          <caption className="sr-only">
            Activity for each of the last eight weeks, newest first
          </caption>
          <thead>
            <tr className="border-line border-b text-grey">
              <th scope="col" className="px-3.5 py-2 text-left font-semibold">
                Week of
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className="px-2 py-2 text-right font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((week, index) => (
              <tr key={week.week} className="border-line border-b last:border-b-0">
                <th scope="row" className="px-3.5 py-2 text-left font-semibold text-ink">
                  {weekLabel(week.week)}
                  {index === 0 ? (
                    <span className="ml-1 font-normal text-grey">(so far)</span>
                  ) : null}
                </th>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={`px-2 py-2 text-right tabular-nums ${week[column.key] ? 'text-ink' : 'text-grey'}`}
                  >
                    {week[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function StatsSection() {
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const { stats, error, loading, reload } = useClubStats(period);

  return (
    <section aria-labelledby="stats-heading">
      <div className="mt-1 flex items-center justify-between gap-2">
        <h2 id="stats-heading" className={HEADING}>
          How the club is used
        </h2>
        <SmallButton onClick={() => void reload()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </SmallButton>
      </div>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        Counted from what the club already keeps. Counts only, never who, and nothing is sent
        anywhere.
      </p>
      <div className="mt-3 mb-3 max-w-[260px]">
        <label htmlFor="stats-period" className="block font-bold text-[0.75rem] text-ink">
          Period
        </label>
        <select
          id="stats-period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as StatsPeriod);
          }}
          className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
        >
          {error}
        </p>
      ) : null}

      {stats ? (
        <>
          <Summary stats={stats} />
          <Joining stats={stats} />
          <Weeks stats={stats} />
          <p className="mt-3 text-[0.75rem] text-grey leading-[1.45]">
            “Opened the app” means a member’s app was open and signed in since the period began. The
            club only knows when each member last used it, so it can’t be counted for a previous
            period. “Started onboarding” is an account that has signed in; Google and Apple sign in
            as they make it. People who opened the app and left without an account are not counted.
            Weeks start on Monday.
          </p>
        </>
      ) : loading ? (
        <p className="py-10 text-center text-[0.875rem] text-grey">Counting…</p>
      ) : null}
    </section>
  );
}
