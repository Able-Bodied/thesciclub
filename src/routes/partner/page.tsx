import { ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { MemberAvatar } from '@/components/member-avatar';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { PARTNER_ROLE_NAME, useIAmPartner } from '@/lib/club-partners';
import {
  fetchMyIntroductions,
  fetchMyPartnerCard,
  fetchMyPeople,
  fetchPartnerStats,
  type MadeIntroduction,
  type PartnerMember,
  type PartnerPerson,
  type PartnerStats,
  STAT_PERIODS,
  withdrawIntroduction,
} from '@/lib/partner-hub';
import { cn } from '@/lib/utils';

/**
 * A trusted partner's own page (20261029100000): their numbers, the people they
 * invited or introduced, and their introductions. Counts and statuses only;
 * nothing from anybody's conversations.
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

export default function PartnerPage() {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const partner = useIAmPartner(memberId);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (partner !== true) return;
    void fetchMyPartnerCard().then((result) => {
      if (result.ok && result.value) setTitle(result.value.title);
    });
  }, [partner]);

  if (account.status === 'loading' || (account.status === 'member' && partner === null)) {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (account.status !== 'member') return <Navigate to="/join" replace />;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[var(--me-measure)]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            {PARTNER_ROLE_NAME}
          </h1>
          {partner && title ? <p className="mt-0.5 text-[0.875rem] text-ink2">{title}</p> : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[var(--me-measure)] px-4 pt-5 pb-8">
        {partner ? (
          <PartnerHub />
        ) : (
          <div className="rounded-[14px] border border-line bg-paper p-4 text-[0.9375rem] text-ink leading-[1.5]">
            <p className="font-bold">This page is for trusted partners.</p>
            <p className="mt-1 text-ink2">
              Trusted partners are professionals who work with people with SCI/D, such as peer
              support leads and therapists. An administrator makes someone a partner.
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

function PartnerHub() {
  return (
    <div className="space-y-8">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <ToolLink to="/partner/card" title="Your card" description="Print your name and QR code." />
        <ToolLink
          to="/me/qr"
          title="QR code or link"
          description="People who scan it can join, as invited by you."
        />
        <ToolLink to="/invites" title="Invite by email" description="Without a limit." />
      </div>
      <Numbers />
      <People />
      <Introductions />
    </div>
  );
}

function ToolLink({ to, title, description }: { to: string; title: string; description: string }) {
  const descriptionId = useId();
  return (
    <Link
      to={to}
      aria-describedby={descriptionId}
      className="flex min-h-[64px] items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 transition-colors hover:bg-tint"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[0.96875rem] text-ink">{title}</span>
        <span id={descriptionId} className="mt-1 block text-[0.8125rem] text-ink2 leading-[1.5]">
          {description}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none text-emphasis" />
    </Link>
  );
}

/* --------------------------------------------------------------- numbers */

const PERIOD_SEGMENTS = STAT_PERIODS.map((p) => [String(p.days), p.label] as const);

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

  const tiles: [string, number | undefined, string?][] = [
    ['Invited', stats?.invited],
    ['Joined', stats?.joined],
    [
      'Took part',
      stats?.active,
      'Posted, replied or said they’re going to an event. Not messages.',
    ],
    ['Introductions', stats?.introductions],
    ['Opened', stats?.opened, 'Both said yes, so a conversation opened.'],
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
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-busy={stats === null}>
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
              {hint ? (
                <dd className="mt-1 text-[0.75rem] text-ink2 leading-[1.4]">{hint}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
        Only about people you invited or introduced, in the period chosen.
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
        Everyone you invited or introduced. To introduce someone, open their profile and choose{' '}
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
            ? 'Nobody yet. People you invite or introduce appear here.'
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
        state={{ from: 'partner' }}
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
      return 'Both said yes';
    case 'declined':
      return 'Didn’t go ahead';
    case 'withdrawn':
      return 'You withdrew it';
    case 'expired':
      return 'Expired without both answering';
  }
}

function Introductions() {
  const announce = useAnnounce();
  const [intros, setIntros] = useState<MadeIntroduction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyIntroductions();
    if (result.ok) setIntros(result.value);
    else setError(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          You haven’t introduced anyone yet. Open someone’s profile and choose Introduce…
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
