import { type ClubStats, useClubStats, weekLabel } from '@/routes/admin/club-stats';
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

function Tile({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className={`${CARD} px-3.5 py-3`}>
      <p className="text-[0.75rem] text-grey leading-[1.35]">{label}</p>
      <p className="mt-1 font-display font-extrabold text-[1.625rem] text-ink leading-none">
        {value}
      </p>
      <p className="mt-1.5 text-[0.75rem] text-ink2 leading-[1.35]">{detail}</p>
    </div>
  );
}

function Summary({ stats }: { stats: ClubStats }) {
  const of = `of ${plural(stats.members, 'member')}`;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Tile label="Opened the app, last day" value={stats.opened1} detail={of} />
      <Tile label="Opened the app, last 7 days" value={stats.opened7} detail={of} />
      <Tile label="Opened the app, last 30 days" value={stats.opened30} detail={of} />
      <Tile
        label="Members"
        value={stats.members}
        detail={`${stats.joined7} new in 7 days, ${stats.joined30} in 30`}
      />
    </div>
  );
}

function Joining({ stats }: { stats: ClubStats }) {
  const unconfirmed = stats.accounts - stats.signedIn;
  const stopped = stats.signedIn - stats.reachedHome;
  const steps = [
    { label: 'Started onboarding', value: stats.signedIn, of: null },
    { label: 'Reached the home screen', value: stats.reachedHome, of: stats.signedIn },
    { label: 'Notifications on', value: stats.notificationsOn, of: stats.reachedHome },
  ];
  return (
    <>
      <h3 className={`${HEADING} mt-5`}>Joining</h3>
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
      <h3 className={`${HEADING} mt-5`}>Week by week</h3>
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
  const { stats, error, loading, reload } = useClubStats();

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
      <p className="mt-1 mb-3 text-[0.75rem] text-grey leading-[1.45]">
        Counted from what the club already keeps. Counts only, never who, and nothing is sent
        anywhere.
      </p>

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
            “Opened” means a member’s app was open and signed in at some point in that time.
            “Started onboarding” is an account that has signed in; Google and Apple sign in as they
            make it. People who opened the app and left without an account are not counted. “Active”
            is members who asked, replied, sent a message or RSVPed that week. Weeks start on
            Monday.
          </p>
        </>
      ) : loading ? (
        <p className="py-10 text-center text-[0.875rem] text-grey">Counting…</p>
      ) : null}
    </section>
  );
}
