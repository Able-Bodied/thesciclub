import { ClubMark } from '@/components/club-mark';
import { organizationByName, useOrganizations } from '@/lib/organizations';
import { photoUrlFor } from '@/lib/photos';
import { cn } from '@/lib/utils';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { BrowseMember } from '@/types/domain';

/**
 * The full-bleed browse card, matching `.pcard` in docs/index.html. The photo
 * *is* the card: it fills the frame and everything else sits on top of it.
 *
 * Purely presentational. It takes a member and a tap handler; it never fetches
 * and holds no state.
 */

/** Deterministic gradient pairs for members with no photo, from the mock's palette. */
const DEFAULT_GRADIENT: [string, string] = ['#102A4C', '#1A3E70'];

const PALETTE: [string, string][] = [
  DEFAULT_GRADIENT,
  ['#1A3E70', '#2C5590'],
  ['#8A6712', '#C9A227'],
  ['#2F6B57', '#3E8F74'],
  ['#4A2E6B', '#6B4494'],
];

/** Stable per-member, so somebody's tile colour does not change between renders. */
export function gradientFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? DEFAULT_GRADIENT;
}

export function initialsOf(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, '').charAt(0))
    .filter(Boolean);
  return (letters.slice(0, 2).join('') || '?').toUpperCase();
}

/**
 * The line under the name: level, completeness, age, city.
 *
 * Every part is optional and the separators come from joining what survives, so
 * a member with no city or no age gets a shorter line rather than a line with a
 * gap in it. Completeness is lowercased to read as prose — "C6 incomplete"
 * rather than "C6 Incomplete" — and omitted entirely when unknown, because
 * "C6 do not know" says nothing.
 */
export function summaryLine(member: BrowseMember): string {
  const level = member.exactLevel ?? member.levelRange;
  const levelPart =
    member.completeness === 'Do not know' ? level : `${level} ${member.completeness.toLowerCase()}`;
  return [levelPart, member.age, member.city].filter(Boolean).join(' · ');
}

/**
 * How many organization marks fit on a card before the row starts competing
 * with the topic chips under it. Three covers the directory as it stands — the
 * busiest member has three — and anything past that is counted rather than
 * drawn, so a member who joins six does not push the chips off the card.
 */
const MAX_CARD_AFFILIATIONS = 3;

/** An organization's badge letters, from its name, when we only have the name. */
export function shortCodeFor(organizationName: string): string {
  const words = organizationName.split(/\s+/).filter(Boolean);
  if (words.length === 1) return (words[0] ?? '').slice(0, 3).toUpperCase();
  return words
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

/** The star on the mentor flag. Inline so the flag is one element, not two. */
function MentorStar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[11px] w-[11px] fill-current">
      <path d="m12 2 2.1 5.6L20 9.7l-5.1 3 .8 6.1-3.7-3-3.7 3 .8-6.1-5.1-3 5.9-2.1L12 2Z" />
    </svg>
  );
}

export interface MemberCardProps {
  member: BrowseMember;
  onOpen: () => void;
}

export function MemberCard({ member, onOpen }: MemberCardProps) {
  if (member.isAdmin) return <OfficialCard member={member} onOpen={onOpen} />;
  return <PersonCard member={member} onOpen={onOpen} />;
}

/**
 * The club's own account.
 *
 * Deliberately not a photo card. This account is not a person, and the things
 * a person card shows — a level, an age, a city — would be fiction on it.
 */
function OfficialCard({ member, onOpen }: MemberCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      // No fixed height, so a single column gives it only the room it needs.
      // In a grid it stretches to its row, because a short card beside a tall
      // one looks like a mistake — which is worse than the empty navy that
      // matching costs. The content stays centred either way.
      className="relative flex min-h-[20rem] w-full flex-col items-center justify-center overflow-hidden rounded-[26px] bg-navy px-8 py-10 text-center shadow-[0_10px_26px_rgba(10,20,35,.18)]"
    >
      <span className="absolute top-[18px] right-[18px] rounded-full bg-gold px-2.5 py-[5px] font-extrabold font-head text-[#2A1E06] text-[0.6875rem] uppercase tracking-[0.08em]">
        Official
      </span>
      <ClubMark size={96} />
      <span className="mt-6 block font-extrabold font-head text-[1.5rem] text-white tracking-[-0.01em]">
        {member.displayName}
      </span>
      <span className="mt-2 block text-[0.84375rem] text-[#B9CADF] leading-[1.5]">
        The club's own account. Questions about membership, the house rules, or anything that has
        gone wrong — this is who answers.
      </span>
    </button>
  );
}

function PersonCard({ member, onOpen }: MemberCardProps) {
  const { organizations } = useOrganizations();
  const photo = photoUrlFor(member.photoPath);
  const [from, to] = gradientFor(member.id);
  const chips = member.topics.slice(0, 3);
  // Every affiliation, as a mark. It was `affiliations[0]` with its name
  // spelled out beside it, which read as one organization per member and, in
  // the live directory, as *the same* organization on every card: NorCal SCI is
  // first for all 23 members who have one, so six other bodies never appeared
  // in the deck at all. Marks are narrow enough to show all of them; the names
  // are on the profile, which is where there is room to read them.
  const affiliations = member.affiliations.slice(0, MAX_CARD_AFFILIATIONS);
  const overflow = member.affiliations.length - affiliations.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block h-[424px] w-full overflow-hidden rounded-[26px] text-left shadow-[0_10px_26px_rgba(10,20,35,.18)]"
      style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
    >
      {/* The initials sit behind the photo, so a photo that fails to load
          reveals a designed tile rather than a broken-image icon. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center font-extrabold font-head text-[118px] text-white opacity-[0.13] tracking-[-0.04em]"
      >
        {initialsOf(member.displayName)}
      </span>

      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-[50%_28%]"
          onError={(e) => {
            e.currentTarget.remove();
          }}
        />
      ) : null}

      <span className="absolute inset-x-0 top-0 h-[120px] bg-gradient-to-b from-[#0A1D3699] via-[#0A1D3640] to-transparent" />
      <span className="absolute inset-x-0 bottom-0 h-[230px] bg-gradient-to-b from-transparent via-[#0A1D36CC] to-[#0A1D36F2]" />

      {member.type === 'mentor' ? (
        <span className="absolute top-[18px] right-[18px] z-10 inline-flex items-center gap-1.5 rounded-full bg-gold px-2.5 py-[5px] font-extrabold font-head text-[#2A1E06] text-[0.6875rem] uppercase leading-none tracking-[0.08em] shadow-[0_2px_8px_rgba(10,20,35,.35)]">
          <MentorStar />
          Mentor
        </span>
      ) : null}

      <span className="absolute inset-x-0 top-0 block px-[18px] pt-[18px] pr-[104px]">
        <span className="block font-extrabold font-head text-[1.75rem] text-white leading-tight tracking-[-0.01em] [text-shadow:0_1px_12px_rgba(10,29,54,.75)]">
          {member.displayName}
        </span>
        <span className="mt-[7px] block text-[0.84375rem] text-[#DCE6F2] leading-[1.45] [text-shadow:0_1px_10px_rgba(10,29,54,.8)]">
          {summaryLine(member)}
        </span>
      </span>

      <span className="absolute inset-x-0 bottom-0 block px-[18px] pb-5">
        {affiliations.length > 0 ? (
          <span className="inline-flex items-center gap-[5px] rounded-full bg-white/95 px-[5px] py-[5px] font-extrabold text-[0.75rem] text-navy leading-none">
            {/* The organization's own logo where the club has a row for it,
                the short-code tile where it does not — several affiliations
                on these rows are bodies the club has no organization for. */}
            {affiliations.map((name) => (
              <OrganizationBadge
                key={name}
                organization={organizationByName(organizations, name)}
                hostName={name}
                className="h-[2.59em] w-[2.59em] rounded-[0.82em] text-[0.53125rem]"
              />
            ))}
            {overflow > 0 ? <span className="pr-1.5 pl-0.5">+{overflow}</span> : null}
            {/* The badges are aria-hidden by contract — they are drawn beside
                their own name everywhere else. Here there is no name to read,
                so the row carries one. */}
            <span className="sr-only">{member.affiliations.join(', ')}</span>
          </span>
        ) : null}
        {chips.length ? (
          <span className={cn('flex flex-wrap gap-2', affiliations.length > 0 ? 'mt-3' : 'mt-0')}>
            {chips.map((topic) => (
              <span
                key={topic}
                className="inline-block rounded-full bg-white/92 px-3 py-[7px] font-bold text-[0.75rem] text-navy leading-[1.2]"
              >
                {topic}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}
