import type { OwnMember } from '@/lib/members';
import { photoUrlFor } from '@/lib/photos';
import { gradientFor, initialsOf } from '@/routes/peers/member-card';

/**
 * The navy hero at the top of Me, from `mePage()` in the mock.
 *
 * Everything on it is read from the member's own row, so nothing here is
 * inferred or invented — the chips say what the club actually knows about you,
 * which is the point of showing them on this screen in particular.
 */

/** "Member since September 2026". The month is enough; the day is not interesting. */
function memberSince(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** Whole years, counted on calendar dates so it does not drift by a day. */
export function ageFrom(isoDate: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#3A2F12] px-2.5 py-[5px] font-semibold text-[#EBD277] text-[0.7375rem]">
      {children}
    </span>
  );
}

export function MeHero({ member }: { member: OwnMember }) {
  const photo = photoUrlFor(member.photoPath);
  const [from, to] = gradientFor(member.id);
  const age = ageFrom(member.birthDate);

  const summary = [member.exactLevel ?? member.levelRange, age, member.city]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="bg-navy px-4 pt-[18px] pb-[26px] text-white">
      <div className="mx-auto flex w-full max-w-[var(--events-measure)] items-center gap-3.5">
        <span
          className="relative grid h-[88px] w-[88px] flex-none place-items-center overflow-hidden rounded-[26px] font-extrabold font-head text-[1.9375rem] text-white"
          style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[50%_32%]"
            />
          ) : (
            initialsOf(member.displayName)
          )}
        </span>

        <div className="min-w-0">
          <h1 className="font-extrabold font-head text-[1.3125rem] leading-[1.2] tracking-[-0.02em]">
            {member.displayName}
          </h1>
          {summary ? <p className="mt-[3px] text-[#B9CADF] text-[0.8125rem]">{summary}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>Member since {memberSince(member.createdAt)}</Chip>
            {member.type === 'mentor' ? <Chip>Mentor</Chip> : null}
            {/* Not decoration: this app is tested by switching between
                accounts, and the club's own account looks like any other
                member until something says otherwise. */}
            {member.isAdmin ? <Chip>Administrator</Chip> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
