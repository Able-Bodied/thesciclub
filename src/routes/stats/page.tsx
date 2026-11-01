import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { MemberAvatar } from '@/components/member-avatar';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { useIAmPartner, useICanConnect } from '@/lib/club-partners';
import { describeThrown } from '@/lib/describe-error';
import { INTRODUCTION_NOTE_MAX, makeIntroduction } from '@/lib/introductions';
import type { MentionCandidate } from '@/lib/mentions';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import {
  fetchMyIntroductions,
  fetchMyPartnerCard,
  fetchMyPeople,
  fetchOrganizationStats,
  fetchPartnerStats,
  type MadeIntroduction,
  type OrganizationStats,
  type PartnerMember,
  type PartnerPerson,
  type PartnerStats,
  STAT_PERIODS,
  withdrawIntroduction,
} from '@/lib/partner-hub';
import { cn } from '@/lib/utils';
import { ConnectNote, MemberField, useConnectableMembers } from '@/routes/peers/connect-fields';

/**
 * Stats & controls, for org admins and trusted partners (20261031110000): their
 * organization's numbers, connecting two members, their own numbers, the people
 * they invited or connected. Counts and statuses only; nothing from anybody's
 * conversations. Invites and QR codes are on Me.
 */

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', DAY);

type PeopleFilter = 'all' | 'no-mentor' | 'pending';
const PEOPLE_FILTERS = [
  ['all', 'Everyone'],
  ['no-mentor', 'Not yet introduced to a mentor'],
  ['pending', 'Still to join'],
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
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[var(--me-measure)]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Stats & controls
          </h1>
          {partner && title ? <p className="mt-0.5 text-[0.875rem] text-ink2">{title}</p> : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[var(--me-measure)] px-4 pt-5 pb-8">
        {canConnect ? (
          <Hub memberId={memberId} isAdmin={account.isAdmin} />
        ) : (
          <div className="rounded-[14px] border border-line bg-paper p-4 text-[0.9375rem] text-ink leading-[1.5]">
            <p className="font-bold">This page is for org admins and trusted partners.</p>
            <p className="mt-1 text-ink2">
              Trusted partners are professionals who work with people with SCI/D, such as peer
              support leads and therapists. An administrator makes someone a partner or an org
              admin.
            </p>
            <Link
              to="/me"
              className="mt-2 inline-flex min-h-[44px] items-center font-bold text-emphasis underline"
            >
              Back to Me
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Hub({ memberId, isAdmin }: { memberId: string | null; isAdmin: boolean }) {
  // Goes up with each connection, so the list below reads it again.
  const [connected, setConnected] = useState(0);
  return (
    <div className="space-y-8">
      <OrganizationNumbers memberId={memberId} isAdmin={isAdmin} />
      <ConnectMembers
        onConnected={() => {
          setConnected((n) => n + 1);
        }}
      />
      <Numbers />
      <People />
      <Introductions connected={connected} />
    </div>
  );
}

/* --------------------------------------------------------------- numbers */

const PERIOD_SEGMENTS = STAT_PERIODS.map((p) => [String(p.days), p.label] as const);

/** A label, its number, and a line saying what it counts. */
type Tile = [string, number | string | undefined, string?];

function Tiles({ tiles, busy }: { tiles: Tile[]; busy: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-busy={busy}>
      {tiles.map(([label, value, hint]) => (
        <div
          key={label}
          className="flex min-h-[76px] flex-col justify-start rounded-[14px] border border-line bg-paper px-3 py-2.5"
        >
          <dt className="font-semibold text-[0.75rem] text-grey uppercase tracking-[0.09em]">
            {label}
          </dt>
          <dd className="mt-1 font-extrabold font-head text-[1.3125rem] text-emphasis leading-none">
            {value ?? '–'}
          </dd>
          {hint ? <dd className="mt-1 text-[0.75rem] text-ink2 leading-[1.4]">{hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Of those who said Going to the events held, how many checked in. */
export function turnout(stats: OrganizationStats): string {
  if (stats.going === 0) return '–';
  return `${String(Math.round((stats.checkedIn / stats.going) * 100))}%`;
}

function OrganizationNumbers({ memberId, isAdmin }: { memberId: string | null; isAdmin: boolean }) {
  const mine = useMyOrganizations(memberId);
  const { organizations } = useOrganizations();
  const fieldId = useId();
  const choices = organizations
    .filter((organization) => isAdmin || mine.ids.has(organization.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [chosenId, setChosenId] = useState<string | null>(null);
  // Their own first; an administrator without one starts on the first by name.
  const chosen =
    choices.find((o) => o.id === chosenId) ??
    choices.find((o) => mine.ids.has(o.id)) ??
    choices[0] ??
    null;
  const [days, setDays] = useState<string>(String(STAT_PERIODS[0].days));
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = chosen?.id ?? null;

  useEffect(() => {
    if (!organizationId) return;
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

  if (!chosen) return null;

  const tiles: Tile[] = [
    ['Members', stats?.members, 'Right now.'],
    ['New members', stats?.joined],
    ['Left', stats?.left],
    ['From a QR code', stats?.byCode, 'Of the new members.'],
    ['From checking in', stats?.byCheckIn, 'Of the new members.'],
    ['Events held', stats?.eventsHeld],
    ['Events coming up', stats?.eventsAhead, 'Right now.'],
    ['Said Going', stats?.going, 'To the events held.'],
    ['Checked in', stats?.checkedIn, 'At the events held.'],
    ['Turnout', stats ? turnout(stats) : undefined, 'Checked in, of those who said Going.'],
    ['Reviews', stats?.reviews],
    ['Average rating', stats ? (stats.rating ?? '–') : undefined, 'Out of 5.'],
  ];

  return (
    <section aria-labelledby="stats-organization-heading">
      <SectionHeading id="stats-organization-heading">Your organization</SectionHeading>
      {choices.length > 1 ? (
        <div className="mb-2">
          <label htmlFor={fieldId} className="block font-bold text-[0.8125rem] text-ink">
            Organization
          </label>
          <select
            id={fieldId}
            value={chosen.id}
            onChange={(e) => {
              setChosenId(e.target.value);
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
      ) : (
        <p className="-mt-1.5 mb-1 font-semibold text-[0.875rem] text-ink2">{chosen.name}</p>
      )}
      <SegmentPills segments={PERIOD_SEGMENTS} value={days} onChange={setDays} className="pt-0" />
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : (
        <Tiles tiles={tiles} busy={stats === null} />
      )}
      <Link
        to={`/events/organizations/${chosen.id}`}
        className="mt-2.5 flex min-h-[48px] items-center justify-center rounded-[12px] border border-line bg-paper px-4 font-bold text-[0.875rem] text-emphasis hover:bg-tint"
      >
        {stats && stats.waiting > 0
          ? `Review ${String(stats.waiting)} waiting to join ${chosen.name}`
          : `Manage ${chosen.name}`}
      </Link>
    </section>
  );
}

/* --------------------------------------------------------------- connect */

function ConnectMembers({ onConnected }: { onConnected: () => void }) {
  const announce = useAnnounce();
  const members = useConnectableMembers();
  const [first, setFirst] = useState<MentionCandidate | null>(null);
  const [second, setSecond] = useState<MentionCandidate | null>(null);
  const [note, setNote] = useState('');
  const [join, setJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const others = (of: MentionCandidate | null) =>
    members?.filter((member) => member.id !== of?.id) ?? null;
  const ready =
    first !== null && second !== null && note.trim() !== '' && note.length <= INTRODUCTION_NOTE_MAX;

  function connect() {
    if (busy || !first || !second) return;
    setBusy(true);
    setFailure(null);
    setDone(null);
    makeIntroduction(first.id, second.id, note, join)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        const names = `${first.displayName} and ${second.displayName} are connected.`;
        setDone(names);
        announce(names);
        setFirst(null);
        setSecond(null);
        setNote('');
        setJoin(false);
        onConnected();
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'Could not connect them.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <section aria-labelledby="stats-connect-heading">
      <SectionHeading id="stats-connect-heading">Connect two members</SectionHeading>
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <p className="text-[0.875rem] text-ink2 leading-[1.5]">
          They are both added to a group conversation right away, and told you connected them.
          Anybody in it can leave.
        </p>
        <MemberField
          label="First member"
          members={others(second)}
          chosen={first}
          onChoose={setFirst}
        />
        <MemberField
          label="Second member"
          members={others(first)}
          chosen={second}
          onChoose={setSecond}
        />
        <ConnectNote note={note} onNote={setNote} join={join} onJoin={setJoin} />
        {failure ? (
          <p
            role="alert"
            className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
          >
            {failure}
          </p>
        ) : null}
        {done ? <p className="mt-3 font-semibold text-[0.875rem] text-ink">{done}</p> : null}
        <button
          type="button"
          onClick={connect}
          disabled={busy || !ready}
          className="mt-3 min-h-[48px] w-full rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi disabled:opacity-50"
        >
          {busy ? 'Connecting…' : 'Connect them'}
        </button>
      </div>
    </section>
  );
}

function Numbers() {
  const [days, setDays] = useState<string>(String(STAT_PERIODS[0].days));
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
    ['Introduced to a mentor', stats?.withMentor, 'Of your people, at any time.'],
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

export function filterPeople(people: PartnerPerson[], filter: PeopleFilter): PartnerPerson[] {
  if (filter === 'pending') return people.filter((p) => p.kind === 'pending');
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

export function introductionStatus(intro: MadeIntroduction): string {
  switch (intro.status) {
    case 'asked':
      return intro.yeses === 1 ? 'Waiting: 1 of 2 said yes' : 'Waiting for both to answer';
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
  const [intros, setIntros] = useState<MadeIntroduction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyIntroductions();
    if (result.ok) setIntros(result.value);
    else setError(result.error);
  }, []);

  // `connected` is read so a new connection is listed at once.
  useEffect(() => {
    if (connected >= 0) void load();
  }, [load, connected]);

  async function withdraw(intro: MadeIntroduction) {
    const names = `${intro.first.name} and ${intro.second.name}`;
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
                  <Link to={`/peers/${intro.first.id}`} className="hover:underline">
                    {intro.first.name}
                  </Link>{' '}
                  &{' '}
                  <Link to={`/peers/${intro.second.id}`} className="hover:underline">
                    {intro.second.name}
                  </Link>
                </span>
                <span className="mt-0.5 block text-[0.75rem] text-grey">
                  {day(intro.createdAt)} · {introductionStatus(intro)}
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
