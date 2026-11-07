import { Loader2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { MemberAvatar } from '@/components/member-avatar';
import { PageTabs, TabPanel, useTabParam } from '@/components/page-tabs';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { useIAmPartner, useICanConnect } from '@/lib/club-partners';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import {
  fetchMyConnections,
  fetchMyPartnerCard,
  fetchMyPeople,
  fetchOrganizationEvents,
  fetchOrganizationStats,
  fetchOrganizationWeeks,
  fetchPartnerStats,
  type HeldEvent,
  type MadeConnection,
  type OrganizationStats,
  type OrganizationWeek,
  type PartnerMember,
  type PartnerPerson,
  type PartnerStats,
  STAT_PERIODS,
  withdrawIntroduction,
} from '@/lib/partner-hub';
import { cn } from '@/lib/utils';
import {
  type Connected,
  ConnectFields,
  ConnectMissing,
  listNames,
  useConnectForm,
} from '@/routes/peers/connect-form';
import { EventNoticesPanel } from '@/routes/stats/event-notices';
import { OrganizationPeople } from '@/routes/stats/organization-people';
import type { Organization } from '@/types/domain';

/**
 * Stats & controls, for org admins and professionals (20261031110000): their
 * organization's numbers, connecting two members, their own numbers, the people
 * they invited or connected. Counts and statuses only; nothing from anybody's
 * conversations. Invites and QR codes are on Me.
 */

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', DAY);

type PeopleFilter = 'all' | 'no-mentor' | 'no-profile' | 'pending' | 'overdue';
const PEOPLE_FILTERS = [
  ['all', 'Everyone'],
  ['no-mentor', 'No mentor yet'],
  ['no-profile', 'Profile not finished'],
  ['pending', 'Still to join'],
  ['overdue', 'Not joined after 7 days'],
] as const satisfies readonly (readonly [PeopleFilter, string])[];

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 font-extrabold font-head text-[1rem] text-ink">
      {children}
    </h2>
  );
}

export default function StatsPage() {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const canConnect = useICanConnect(memberId);
  const partner = useIAmPartner(memberId);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (partner !== true) return;
    void fetchMyPartnerCard().then((result) => {
      if (result.ok && result.value) setTitle(result.value.title);
    });
  }, [partner]);

  if (account.status === 'loading' || (account.status === 'member' && canConnect === null)) {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (account.status !== 'member') return <Navigate to="/join" replace />;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[var(--me-measure)]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Stats & controls
          </h1>
          {partner && title ? <p className="mt-0.5 text-[0.875rem] text-ink2">{title}</p> : null}
        </div>
      </header>
      {canConnect ? (
        <Hub memberId={memberId} isAdmin={account.isAdmin} />
      ) : (
        <div className={COLUMN}>
          <div className="rounded-[14px] border border-line bg-paper p-4 text-[0.9375rem] text-ink leading-[1.5]">
            <p className="font-bold">This page is for org admins and verified professionals.</p>
            <p className="mt-1 text-ink2">
              Verified professionals work with people with SCI/D, such as peer support leads and
              therapists. An administrator makes someone a verified professional or an org admin.
            </p>
            <Link
              to="/me"
              className="mt-2 inline-flex min-h-[44px] items-center font-bold text-emphasis underline"
            >
              Back to Me
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const COLUMN = 'mx-auto w-full max-w-[var(--me-measure)] px-4 pt-4 pb-8';

/**
 * In tabs (the owner, 2026-11-04): on a phone the page was four screens
 * long. An organization's tabs only for its org admins and administrators.
 */
type HubTab = 'overview' | 'people' | 'events' | 'connect' | 'yours';
const ORGANIZATION_TABS: readonly HubTab[] = ['overview', 'people', 'events', 'connect', 'yours'];
const PARTNER_TABS: readonly HubTab[] = ['yours', 'connect'];
const TAB_LABEL: Record<HubTab, string> = {
  overview: 'Overview',
  people: 'People',
  events: 'Events',
  connect: 'Connect',
  yours: 'Your numbers',
};

function Hub({ memberId, isAdmin }: { memberId: string | null; isAdmin: boolean }) {
  const mine = useMyOrganizations(memberId);
  const { organizations, loading } = useOrganizations();
  if (mine.loading || loading) {
    return <p className="py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
  }
  const choices = organizations
    .filter((organization) => isAdmin || mine.ids.has(organization.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <HubTabs choices={choices} mine={mine.ids} />;
}

function HubTabs({ choices, mine }: { choices: Organization[]; mine: Set<string> }) {
  const values = choices.length > 0 ? ORGANIZATION_TABS : PARTNER_TABS;
  const first = values[0] ?? 'yours';
  const [tab, setTab] = useTabParam(values, first);
  const [chosenId, setChosenId] = useState<string | null>(null);
  // Their own first; an administrator without one starts on the first by name.
  const chosen =
    choices.find((o) => o.id === chosenId) ??
    choices.find((o) => mine.has(o.id)) ??
    choices[0] ??
    null;
  const [days, setDays] = useState(DEFAULT_DAYS);
  // Goes up with each connection, so the list below reads it again.
  const [connected, setConnected] = useState(0);
  const shown = values.includes(tab) ? tab : first;
  const forOrganization = shown === 'overview' || shown === 'people' || shown === 'events';

  return (
    <>
      <PageTabs
        id="stats"
        label="Stats & controls sections"
        measure="max-w-[var(--me-measure)]"
        value={shown}
        onChange={setTab}
        tabs={values.map((value) => ({ value, label: TAB_LABEL[value] }))}
      />
      <div className={COLUMN}>
        <TabPanel id="stats" value={shown} className="space-y-6">
          {forOrganization && chosen ? (
            <OrganizationChoice choices={choices} chosen={chosen} onChoose={setChosenId} />
          ) : null}
          {shown === 'overview' && chosen ? (
            <OrganizationNumbers organization={chosen} days={days} onDays={setDays} />
          ) : null}
          {shown === 'people' && chosen ? (
            <OrganizationPeople organizationId={chosen.id} organizationName={chosen.name} />
          ) : null}
          {shown === 'events' && chosen ? (
            <>
              <EventNoticesPanel
                organizationId={chosen.id}
                organizationName={chosen.name}
                organizations={choices
                  .filter((o) => mine.has(o.id) || o.id === chosen.id)
                  .map((o) => ({ id: o.id, name: o.name, open: o.joinsNeedApproval !== true }))}
              />
              <HeldEvents organizationId={chosen.id} days={days} onDays={setDays} />
            </>
          ) : null}
          {shown === 'connect' ? (
            <>
              <ConnectMembers
                onConnected={() => {
                  setConnected((n) => n + 1);
                }}
              />
              <Introductions connected={connected} />
            </>
          ) : null}
          {shown === 'yours' ? (
            <>
              <Numbers />
              <People />
            </>
          ) : null}
        </TabPanel>
      </div>
    </>
  );
}

/** Which organization the Overview, People and Events tabs are about. */
function OrganizationChoice({
  choices,
  chosen,
  onChoose,
}: {
  choices: Organization[];
  chosen: Organization;
  onChoose: (id: string) => void;
}) {
  const fieldId = useId();
  if (choices.length === 1) {
    return (
      <h2 className="font-extrabold font-head text-[1.0625rem] text-ink leading-[1.3]">
        {chosen.name}
      </h2>
    );
  }
  return (
    <div>
      <h2 className="sr-only">{chosen.name}</h2>
      <label htmlFor={fieldId} className="block font-bold text-[0.8125rem] text-ink">
        Organization
      </label>
      <select
        id={fieldId}
        value={chosen.id}
        onChange={(e) => {
          onChoose(e.target.value);
        }}
        className="mt-1.5 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink"
      >
        {choices.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/* --------------------------------------------------------------- numbers */

const PERIOD_SEGMENTS = STAT_PERIODS.map((p) => [String(p.days), p.label] as const);

/** A label, its number, and a line saying what it counts. */
type Tile = [string, number | string | undefined, string?];

/**
 * One number to a row, label on the left and number on the right: tiles in
 * two columns were uneven heights and a long scroll on a phone.
 */
function Tiles({ tiles, busy, title }: { tiles: Tile[]; busy: boolean; title?: string }) {
  return (
    <div>
      {title ? (
        <h3 className="mb-1.5 font-extrabold font-head text-[0.875rem] text-ink">{title}</h3>
      ) : null}
      <dl
        className="overflow-hidden rounded-[14px] border border-line bg-paper sm:grid sm:grid-cols-2"
        aria-busy={busy}
      >
        {tiles.map(([label, value, hint]) => (
          <div
            key={label}
            className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-line border-b px-3.5 py-2.5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
          >
            <dt className="font-semibold text-[0.875rem] text-ink">{label}</dt>
            <dd
              className={cn(
                'text-right font-extrabold font-head text-[1.25rem] text-emphasis tabular-nums leading-none',
                hint && 'row-span-2',
              )}
            >
              {value ?? '–'}
            </dd>
            {hint ? (
              <dd className="mt-0.5 text-[0.75rem] text-ink2 leading-[1.4]">{hint}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Thirty days until a member chooses another period. */
const DEFAULT_DAYS = '30';

/** Of those who said Going, how many came. A walk-in is not turnout. */
export function turnout(going: number, saidGoingAndCame: number): string {
  if (going === 0) return '–';
  return `${String(Math.round((saidGoingAndCame / going) * 100))}%`;
}

/** Of those it could be for, or nothing to go on. */
export function mentorShare(stats: PartnerStats): string {
  if (stats.couldHaveMentor === 0) return 'Of your people, at any time.';
  const share = Math.round((stats.withMentor / stats.couldHaveMentor) * 100);
  return `${String(share)}% of your people, at any time.`;
}

/** "Under a day", "1 day", "4 days"; a dash until anybody has one. */
export function daysLabel(days: number | null): string {
  if (days === null) return '–';
  if (days < 1) return 'Under a day';
  const whole = Math.round(days);
  return whole === 1 ? '1 day' : `${String(whole)} days`;
}

const heldOn = (event: HeldEvent) =>
  new Date(event.startTime).toLocaleDateString('en-US', {
    ...DAY,
    timeZone: event.timezone ?? 'America/Los_Angeles',
  });

/** How many show before Show all, so a busy year does not bury the page. */
const FIRST_EVENTS = 10;

function HeldEvents({
  organizationId,
  days,
  onDays,
}: {
  organizationId: string;
  days: string;
  onDays: (days: string) => void;
}) {
  const [events, setEvents] = useState<HeldEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setEvents(null);
    setError(null);
    setAll(false);
    void fetchOrganizationEvents(organizationId, Number(days)).then((result) => {
      if (!live) return;
      if (result.ok) setEvents(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [organizationId, days]);

  const shown = events === null ? null : all ? events : events.slice(0, FIRST_EVENTS);
  return (
    <section aria-labelledby="stats-held-heading">
      <h3
        id="stats-held-heading"
        className="mb-2 font-extrabold font-head text-[0.875rem] text-ink"
      >
        Events held
      </h3>
      <SegmentPills segments={PERIOD_SEGMENTS} value={days} onChange={onDays} className="pt-0" />
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : events === null || shown === null ? (
        <p className="py-6 text-center text-[0.875rem] text-grey">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-paper px-3.5 py-4 text-center text-[0.875rem] text-grey">
          No events held in this period.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {shown.map((event) => (
            <li key={event.id} className="border-line border-b last:border-b-0">
              <Link
                to={`/events/${event.id}`}
                className="block min-h-[44px] p-3 transition-colors hover:bg-tint"
              >
                <span className="block break-words font-bold text-[0.9375rem] text-ink">
                  {event.title}
                </span>
                <span className="mt-0.5 block text-[0.75rem] text-grey">{heldOn(event)}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-ink2">
                  {event.going} going · {event.checkedIn} checked in
                  {event.going > 0
                    ? ` · ${turnout(event.going, event.saidGoingAndCame)} turnout`
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {events && events.length > FIRST_EVENTS ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => {
            setAll(!all);
          }}
          className="mt-2 min-h-[44px] font-semibold text-[0.875rem] text-emphasis underline"
        >
          {all ? 'Show fewer' : `Show all ${String(events.length)}`}
        </button>
      ) : null}
    </section>
  );
}

function OrganizationNumbers({
  organization,
  days,
  onDays,
}: {
  organization: Organization;
  days: string;
  onDays: (days: string) => void;
}) {
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = organization.id;

  useEffect(() => {
    let live = true;
    setStats(null);
    setError(null);
    void fetchOrganizationStats(organizationId, Number(days)).then((result) => {
      if (!live) return;
      if (result.ok) setStats(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [organizationId, days]);

  const busy = stats === null;
  const turnoutOf = stats ? turnout(stats.going, stats.saidGoingAndCame) : undefined;
  return (
    <section aria-labelledby="stats-organization-heading" className="space-y-4">
      <h3 id="stats-organization-heading" className="sr-only">
        Your organization
      </h3>
      <SegmentPills segments={PERIOD_SEGMENTS} value={days} onChange={onDays} className="pt-0" />
      {stats && stats.waiting > 0 ? (
        <ManageLink organization={organization} waiting={stats.waiting} />
      ) : null}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : (
        <>
          <Tiles
            title="Membership"
            busy={busy}
            tiles={[
              ['Members', stats?.members, 'Right now.'],
              ['New members', stats?.joined],
            ]}
          />
          <Tiles
            title="Events"
            busy={busy}
            tiles={[
              ['Events held', stats?.eventsHeld],
              ['Checked in', stats?.checkedIn, 'All events held, together.'],
              ['Turnout', turnoutOf, 'Checked in, of those who said Going.'],
              ['First-timers', stats?.firstTimers, 'Came to their first event.'],
              ['Came back', stats?.cameBack, 'Have been to more than one.'],
            ]}
          />
          <Tiles
            title="Reviews"
            busy={busy}
            tiles={[
              ['Reviews', stats?.reviews],
              ['Average rating', stats ? (stats.rating ?? '–') : undefined, 'Out of 5.'],
            ]}
          />
          <Weeks organizationId={organization.id} />
        </>
      )}
      {stats && stats.waiting > 0 ? null : <ManageLink organization={organization} waiting={0} />}
    </section>
  );
}

/** To the organization's page; first, when somebody is waiting to join. */
function ManageLink({ organization, waiting }: { organization: Organization; waiting: number }) {
  return (
    <Link
      to={`/events/organizations/${organization.id}`}
      className={cn(
        'flex min-h-[48px] items-center justify-center rounded-[12px] px-4 font-bold text-[0.875rem]',
        waiting > 0
          ? 'bg-action text-white hover:bg-action-hi'
          : 'border border-line bg-paper text-emphasis hover:bg-tint',
      )}
    >
      {waiting > 0
        ? `Review ${String(waiting)} waiting to join ${organization.name}`
        : `Manage ${organization.name}`}
    </Link>
  );
}

const WEEK_COLUMNS: {
  label: string;
  value: (week: OrganizationWeek) => number | string;
}[] = [
  { label: 'Members', value: (week) => week.members },
  { label: 'Turnout', value: (week) => turnout(week.going, week.saidGoingAndCame) },
  { label: 'New', value: (week) => week.joined },
  { label: 'Events', value: (week) => week.events },
  { label: 'Came', value: (week) => week.checkedIn },
];

const weekOf = (week: string) =>
  new Date(`${week}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Weeks({ organizationId }: { organizationId: string }) {
  const [weeks, setWeeks] = useState<OrganizationWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setWeeks(null);
    setError(null);
    void fetchOrganizationWeeks(organizationId).then((result) => {
      if (!live) return;
      if (result.ok) setWeeks(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [organizationId]);

  if (error) {
    return (
      <p role="alert" className="text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (weeks === null) return null;
  return (
    <div>
      <h3 className="font-extrabold font-head text-[0.875rem] text-ink">The last eight weeks</h3>
      <p className="mt-0.5 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        Week by week, whatever the period.
      </p>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-paper">
        <table className="w-full text-[0.8125rem]">
          <caption className="sr-only">
            The organization for each of the last eight weeks, newest first
          </caption>
          <thead>
            <tr className="border-line border-b text-grey">
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">
                Week of
              </th>
              {WEEK_COLUMNS.map((column) => (
                <th key={column.label} scope="col" className="px-1.5 py-2 text-right font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={week.week} className="border-line border-b last:border-b-0">
                <th scope="row" className="px-2.5 py-2 text-left font-semibold text-ink">
                  {weekOf(week.week)}{' '}
                  {index === 0 ? <span className="font-normal text-grey">(so far)</span> : null}
                </th>
                {WEEK_COLUMNS.map((column) => (
                  <td key={column.label} className="px-1.5 py-2 text-right text-ink tabular-nums">
                    {column.value(week)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- connect */

function ConnectMembers({ onConnected }: { onConnected: () => void }) {
  const announce = useAnnounce();
  const form = useConnectForm();
  const [done, setDone] = useState<Connected | null>(null);

  function connect() {
    setDone(null);
    void form.submit().then((result) => {
      if (!result) return;
      setDone(result);
      announce(result.summary);
      onConnected();
    });
  }

  return (
    <section aria-labelledby="stats-connect-heading">
      <SectionHeading id="stats-connect-heading">Connect members</SectionHeading>
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <p className="text-[0.875rem] text-ink2 leading-[1.5]">
          Introduce two or more people in a new group, or add people to a group you have. They are
          added right away, and told you connected them. Anybody in it can leave.
        </p>
        <ConnectFields form={form} />
        {done ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[11px] bg-tint px-3 py-2.5 font-semibold text-[0.875rem] text-ink">
            {done.summary}
            {done.canOpen ? (
              <Link
                to={`/chat/t/${done.threadId}`}
                className="text-emphasis underline underline-offset-2"
              >
                Open the conversation
              </Link>
            ) : null}
          </p>
        ) : null}
        <button
          type="button"
          onClick={connect}
          disabled={form.busy || form.missing !== null}
          className="mt-3 min-h-[48px] w-full rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi disabled:opacity-50"
        >
          {form.actionLabel}
        </button>
        <ConnectMissing form={form} className="mt-1.5 text-center" />
      </div>
    </section>
  );
}

function Numbers() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    void fetchPartnerStats(Number(days)).then((result) => {
      if (!live) return;
      if (result.ok) setStats(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [days]);

  const tiles: Tile[] = [
    ['Invited', stats?.invited],
    ['Joined', stats?.joined],
    [
      'Took part',
      stats?.active,
      'Posted, replied or said they’re going to an event. Not messages.',
    ],
    ['Connected', stats?.opened, 'Pairs you connected.'],
    [
      'Introduced to a mentor',
      stats?.withMentor,
      stats ? mentorShare(stats) : 'Of your people, at any time.',
    ],
    [
      'Time to a mentor',
      stats ? daysLabel(stats.daysToMentor) : undefined,
      'Typical time from joining to meeting a first mentor.',
    ],
  ];

  return (
    <section aria-labelledby="partner-numbers-heading">
      <SectionHeading id="partner-numbers-heading">Your numbers</SectionHeading>
      <SegmentPills segments={PERIOD_SEGMENTS} value={days} onChange={setDays} className="pt-0" />
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : (
        <Tiles tiles={tiles} busy={stats === null} />
      )}
      <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
        Only about people you invited or connected, in the period chosen.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- people */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function filterPeople(
  people: PartnerPerson[],
  filter: PeopleFilter,
  now = Date.now(),
): PartnerPerson[] {
  if (filter === 'pending') return people.filter((p) => p.kind === 'pending');
  if (filter === 'overdue') {
    return people.filter(
      (p) =>
        p.kind === 'pending' &&
        p.invitedAt !== null &&
        now - new Date(p.invitedAt).getTime() >= WEEK_MS,
    );
  }
  if (filter === 'no-profile') return people.filter((p) => p.kind === 'member' && !p.profileDone);
  if (filter === 'no-mentor')
    return people.filter(
      (p): p is PartnerMember =>
        p.kind === 'member' && !p.introducedToMentor && p.memberType !== 'mentor',
    );
  return people;
}

function People() {
  const [people, setPeople] = useState<PartnerPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PeopleFilter>('all');

  useEffect(() => {
    let live = true;
    void fetchMyPeople().then((result) => {
      if (!live) return;
      if (result.ok) setPeople(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, []);

  const shown = people ? filterPeople(people, filter) : null;

  return (
    <section aria-labelledby="partner-people-heading">
      <SectionHeading id="partner-people-heading">My people</SectionHeading>
      <p className="-mt-1.5 mb-1 text-[0.8125rem] text-ink2 leading-[1.5]">
        Everyone you invited or connected. You can also connect someone from their profile, with{' '}
        <b>Introduce…</b>
      </p>
      <SegmentPills segments={PEOPLE_FILTERS} value={filter} onChange={setFilter} />
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : shown === null ? (
        <p className="py-6 text-center text-[0.875rem] text-grey">Loading your people…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-paper px-3.5 py-6 text-center text-[0.875rem] text-grey">
          {people?.length === 0
            ? 'Nobody yet. People you invite or connect appear here.'
            : 'Nobody here.'}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {shown.map((person) =>
            person.kind === 'member' ? (
              <MemberRow key={person.memberId} person={person} />
            ) : (
              <li
                key={person.inviteId ?? person.email}
                className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 basis-[13rem]">
                  <span className="block break-words font-bold text-[0.9375rem] text-ink [overflow-wrap:anywhere]">
                    {person.email}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-grey">
                    {person.invitedAt ? `Invited ${day(person.invitedAt)}` : 'Invited'} · not joined
                    yet
                  </span>
                </span>
                <Link
                  to="/invites"
                  className="inline-flex min-h-[44px] items-center rounded-[10px] bg-tint px-3 font-semibold text-[0.8125rem] text-emphasis"
                >
                  Resend in Invites
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[0.75rem]',
        on ? 'bg-tint text-emphasis' : 'border border-line text-grey',
      )}
    >
      {on ? '✓ ' : ''}
      {children}
    </span>
  );
}

function MemberRow({ person }: { person: PartnerMember }) {
  return (
    <li className="border-line border-b last:border-b-0">
      <Link
        to={`/peers/${person.memberId}`}
        state={{ from: 'stats' }}
        className="flex items-start gap-3 p-3 transition-colors hover:bg-tint"
      >
        <span aria-hidden="true">
          <MemberAvatar
            id={person.memberId}
            displayName={person.displayName}
            photoPath={person.photoPath}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[0.9375rem] text-ink">
            {person.displayName}
            {person.memberType === 'mentor' ? (
              <span className="font-normal text-grey"> · mentor</span>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            <Chip on={person.joinedAt !== null}>
              {person.joinedAt ? `Joined ${day(person.joinedAt)}` : 'Joined'}
            </Chip>
            <Chip on={person.profileDone}>
              {person.profileDone ? 'Profile finished' : 'Profile not finished'}
            </Chip>
            {person.memberType === 'mentor' ? null : (
              <Chip on={person.introducedToMentor}>
                {person.introducedToMentor ? 'Introduced to a mentor' : 'No mentor yet'}
              </Chip>
            )}
            {person.introductions > 0 ? (
              <Chip on>
                {person.introductions === 1
                  ? '1 introduction'
                  : `${String(person.introductions)} introductions`}
              </Chip>
            ) : null}
            {person.invited ? <Chip on>Invited by you</Chip> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/* --------------------------------------------------------- introductions */

/** Where they met, or how far a pair from before got. */
export function connectionPlace(intro: MadeConnection): string {
  if (intro.status !== 'opened' || intro.groupName === null) return introductionStatus(intro);
  return intro.intoGroup ? `Added to “${intro.groupName}”` : `New group “${intro.groupName}”`;
}

export function introductionStatus(intro: MadeConnection): string {
  switch (intro.status) {
    case 'asked':
      return 'Waiting for both to answer';
    case 'opened':
      return 'Connected';
    case 'declined':
      return 'Didn’t go ahead';
    case 'withdrawn':
      return 'You withdrew it';
    case 'expired':
      return 'Expired without both answering';
  }
}

function Introductions({ connected }: { connected: number }) {
  const announce = useAnnounce();
  const [intros, setIntros] = useState<MadeConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyConnections();
    if (result.ok) setIntros(result.value);
    else setError(result.error);
  }, []);

  // `connected` is read so a new connection is listed at once.
  useEffect(() => {
    if (connected >= 0) void load();
  }, [load, connected]);

  async function withdraw(intro: MadeConnection) {
    const names = listNames(intro.people.map((p) => p.name));
    if (
      !window.confirm(`Withdraw your introduction of ${names}?\n\nNeither will be asked again.`)
    ) {
      return;
    }
    setBusy(intro.id);
    setError(null);
    const result = await withdrawIntroduction(intro.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce(`Introduction of ${names} withdrawn.`);
    void load();
  }

  return (
    <section aria-labelledby="partner-intros-heading">
      <SectionHeading id="partner-intros-heading">Introductions</SectionHeading>
      {error ? (
        <p role="alert" className="mb-2 text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
      {intros === null ? (
        error ? null : (
          <p className="py-6 text-center text-[0.875rem] text-grey">Loading introductions…</p>
        )
      ) : intros.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-paper px-3.5 py-6 text-center text-[0.875rem] text-grey">
          You haven’t connected anyone yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {intros.map((intro) => (
            <li
              key={intro.id}
              className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 basis-[14rem]">
                <span className="block font-bold text-[0.9375rem] text-ink">
                  {intro.people.map((person, index) => (
                    <Fragment key={person.id}>
                      {index === 0 ? null : index === intro.people.length - 1 ? ' & ' : ', '}
                      <Link to={`/peers/${person.id}`} className="hover:underline">
                        {person.name}
                      </Link>
                    </Fragment>
                  ))}
                </span>
                <span className="mt-0.5 block text-[0.75rem] text-grey">
                  {day(intro.createdAt)} · {connectionPlace(intro)}
                </span>
                <span className="mt-0.5 line-clamp-2 block break-words text-[0.8125rem] text-ink2 leading-[1.45]">
                  {intro.note}
                </span>
              </span>
              {intro.status === 'opened' && intro.threadId ? (
                <Link
                  to={`/chat/t/${intro.threadId}`}
                  className="inline-flex min-h-[44px] items-center rounded-[10px] bg-tint px-3 font-semibold text-[0.8125rem] text-emphasis"
                >
                  Open the conversation
                </Link>
              ) : intro.status === 'asked' ? (
                busy === intro.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-grey" />
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      void withdraw(intro);
                    }}
                    className="min-h-[44px] rounded-[10px] bg-destructive/10 px-3 font-semibold text-[0.8125rem] text-destructive disabled:opacity-40"
                  >
                    Withdraw
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
