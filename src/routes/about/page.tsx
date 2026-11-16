import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';
import { usePhoto } from '@/lib/use-photo';
import { gradientFor, initialsOf } from '@/routes/peers/member-card';
import { RolePill } from '@/routes/peers/role-pill';
import {
  asksCompleteness,
  type Completeness,
  type ExactLevel,
  type InjuryType,
  injuryLabel,
  type LevelRange,
} from '@/types/domain';

/**
 * About us, at /about: the members building the club, for anybody (the
 * owner, 2026-11-15), linked from the welcome screen's "by people with SCI".
 *
 * The city, age and the injury's month and day are blurred (the owner). The
 * database never sends them (about_us_team, 20261115150000): what is blurred
 * here is a stand-in, so the real ones are not in the page to unblur.
 */

export interface TeamMember {
  id: string;
  display_name: string;
  type: string;
  photo_path: string | null;
  photo_alt: string | null;
  level_range: LevelRange;
  exact_level: ExactLevel | null;
  completeness: Completeness;
  injury_type: InjuryType | null;
  condition_name: string | null;
  injury_year: number | null;
  injury_date_precision: 'day' | 'month' | 'year' | null;
}

/** Stand-ins, never anybody's own: each member gets one of these by id. */
const STAND_IN_PLACES = [
  'Sacramento, CA',
  'San Jose, CA',
  'Oakland, CA',
  'Fresno, CA',
  'Davis, CA',
];
const STAND_IN_DAYS = ['Mar 14', 'Aug 2', 'Nov 21', 'Jun 9', 'Jan 30'];
const STAND_IN_MONTHS = ['March', 'August', 'November', 'June', 'January'];

function pick<T>(list: readonly T[], id: string): T {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return list[hash % list.length] as T;
}

/** Shown blurred; a screen reader hears that it is hidden, not the stand-in. */
function Blurred({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden="true" className="select-none blur-[4px]">
        {children}
      </span>
      <span className="sr-only">hidden</span>
    </>
  );
}

function levelLine(member: TeamMember): string {
  const level = injuryLabel({
    injuryType: member.injury_type,
    conditionName: member.condition_name,
    exactLevel: member.exact_level,
    levelRange: member.level_range,
  });
  return member.completeness === 'Do not know' || !asksCompleteness(member.injury_type)
    ? level
    : `${level} ${member.completeness.toLowerCase()}`;
}

function TeamCard({ member }: { member: TeamMember }) {
  const { url: photo, onError } = usePhoto(member.photo_path, 'thumb');
  const [from, to] = gradientFor(member.id);
  const precision = member.injury_date_precision;
  return (
    <li className="overflow-hidden rounded-[18px] border border-line bg-paper">
      <div
        className="relative grid aspect-square place-items-center font-extrabold font-display text-[3.5rem] text-white"
        style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
      >
        <span aria-hidden="true" className="opacity-40">
          {initialsOf(member.display_name)}
        </span>
        {photo ? (
          <img
            src={photo}
            alt={member.photo_alt ?? ''}
            decoding="async"
            onError={onError}
            className="absolute inset-0 h-full w-full object-cover object-[50%_28%]"
          />
        ) : null}
        {member.type === 'mentor' ? (
          <RolePill
            kind="mentor"
            organizations={[]}
            className="absolute top-2 right-2 shadow-[0_2px_8px_rgba(10,20,35,.35)]"
          />
        ) : null}
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <h2 className="font-extrabold font-head text-[1rem] text-ink leading-tight">
          {member.display_name}
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-snug">
          {levelLine(member)} · <Blurred>{String(30 + (member.id.charCodeAt(0) % 20))}</Blurred>
        </p>
        <p className="text-[0.8125rem] text-ink2 leading-snug">
          <Blurred>{pick(STAND_IN_PLACES, member.id)}</Blurred>
        </p>
        {member.injury_year ? (
          <p className="text-[0.8125rem] text-grey leading-snug">
            Injured{' '}
            {precision === 'day' ? (
              <>
                <Blurred>{pick(STAND_IN_DAYS, member.id)}</Blurred>,{' '}
              </>
            ) : precision === 'month' ? (
              <>
                <Blurred>{pick(STAND_IN_MONTHS, member.id)}</Blurred>{' '}
              </>
            ) : null}
            {member.injury_year}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default function AboutPage() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void getSupabase()
      .rpc('about_us_team')
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setFailed(true);
        else setTeam((data as TeamMember[] | null) ?? []);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto min-h-dvh w-full max-w-[680px] bg-canvas px-[18px] pt-3 pb-[max(32px,env(safe-area-inset-bottom))] outline-none"
    >
      <Link
        to="/"
        data-target="small"
        className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-emphasis"
      >
        <ChevronLeft className="h-4 w-4" />
        The SCI Club
      </Link>
      <h1 className="mt-3 font-extrabold font-display text-[1.75rem] text-ink leading-tight tracking-[-0.01em]">
        The people building the club
      </h1>
      <p className="mt-2 text-[0.9375rem] text-ink2 leading-[1.6]">
        The SCI Club is built by people with spinal cord injuries, for people with spinal cord
        injuries. These are the members working on the app.
      </p>
      <p className="mt-2 text-[0.8125rem] text-grey leading-[1.5]">
        Ages, cities and injury dates are blurred here. Members see them inside the club.
      </p>

      {failed ? (
        <p className="mt-6 text-[0.9375rem] text-ink2">
          The team could not be loaded. Try again in a moment.
        </p>
      ) : team ? (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {team.map((member) => (
            <TeamCard key={member.id} member={member} />
          ))}
        </ul>
      ) : (
        <div className="mt-5 h-[480px]" aria-busy="true" />
      )}

      <div className="mt-7 rounded-[18px] bg-paper p-4 text-center">
        <p className="font-bold text-[0.9375rem] text-emphasis leading-[1.45]">
          Meet them and other people with SCI.
        </p>
        <Link
          to="/join"
          state={{ door: 'join' }}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white"
        >
          Join the club
        </Link>
      </div>
    </main>
  );
}
