import { ChevronLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { injuryDateLabel, timeSinceLabel } from '@/lib/injury';
import { useBrowseMember } from '@/lib/members';
import { photoUrlFor } from '@/lib/photos';
import { gradientFor, initialsOf, shortCodeFor, summaryLine } from '@/routes/peers/member-card';
import type { BrowseMember } from '@/types/domain';

/**
 * One member's full profile — where a tapped card lands.
 *
 * Laid out after the mock's peer page: the photo as a hero with the name over
 * it, then the things members actually search on, then the flatter biographical
 * detail. Sections render only when there is something in them, so a sparse
 * profile reads as short rather than as broken.
 *
 * There is no contact action yet. Messaging is not built, and a button that
 * opens nothing is worse than no button.
 */

/** A labelled row in the details card, skipped entirely when empty. */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 border-line border-b py-3 last:border-b-0">
      <span className="w-[104px] flex-none text-[12.5px] text-grey">{label}</span>
      <span className="text-[13.6px] leading-[1.42]">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      {children}
    </>
  );
}

function Chips({ items, tone }: { items: string[]; tone: 'solid' | 'outline' | 'gold' }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold-lt text-gold-dp'
      : tone === 'outline'
        ? 'border border-line text-ink2'
        : 'bg-tint text-navy';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full px-2.5 py-[5px] font-semibold text-[11.8px] leading-[1.25] ${cls}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/**
 * How long ago the injury was, at the precision that was given. Says nothing
 * at all when no date was recorded, which is the case for everybody who came
 * from the NorCal SCI directory.
 */
function injuryLine(member: BrowseMember): string | null {
  const since = timeSinceLabel(member);
  const when = injuryDateLabel(member);
  if (since && when) return `${since} · injured ${when}`;
  return since ?? (when ? `Injured ${when}` : null);
}

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member, loading, error, signedOut, notFound } = useBrowseMember(id);

  if (loading) {
    return <Centered>Loading…</Centered>;
  }
  if (signedOut) {
    return <Centered>The club is members only. Sign in to see who is here.</Centered>;
  }
  if (notFound) {
    return <Centered>That member is not in the club.</Centered>;
  }
  if (error || !member) {
    return <Centered>{error ?? 'Could not load this member.'}</Centered>;
  }

  const [from, to] = gradientFor(member.id);
  const photo = photoUrlFor(member.photoPath);
  const verifier = member.affiliations[0] ?? null;
  const injury = injuryLine(member);

  return (
    <div className="flex-1 overflow-y-auto">
      <div
        className="relative mx-auto h-[340px] w-full max-w-[760px] lg:h-[420px] lg:rounded-b-[28px]"
        style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-extrabold font-head text-[110px] text-white opacity-[0.13]"
        >
          {initialsOf(member.displayName)}
        </span>
        {photo ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_28%]"
            onError={(e) => {
              e.currentTarget.remove();
            }}
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 h-[200px] bg-gradient-to-b from-transparent via-[#0A1D36CC] to-[#0A1D36F2]" />

        <button
          type="button"
          onClick={() => {
            void navigate(-1);
          }}
          className="absolute top-4 left-3 inline-flex items-center gap-1 rounded-full bg-black/35 py-2 pr-3.5 pl-2 font-bold text-[13.5px] text-white backdrop-blur-sm"
        >
          <ChevronLeft className="h-4 w-4" />
          Peers
        </button>

        {member.type === 'mentor' ? (
          <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-gold px-2.5 py-[5px] font-extrabold font-head text-[#2A1E06] text-[11px] uppercase tracking-[0.08em]">
            Mentor
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 px-[18px] pb-[18px]">
          <h1 className="font-extrabold font-head text-[30px] text-white tracking-[-0.02em] [text-shadow:0_1px_12px_rgba(10,29,54,.7)]">
            {member.displayName}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#D3DFEE]">{summaryLine(member)}</p>
          {injury ? <p className="mt-1 text-[12.5px] text-[#9FB3CD]">{injury}</p> : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-6">
        {member.topics.length ? (
          <Section title="Happy to talk about">
            <p className="-mt-1 mb-2.5 text-[12.5px] text-grey leading-[1.45]">
              What {member.displayName} offered to be asked about.
            </p>
            <Chips items={member.topics} tone="solid" />
          </Section>
        ) : null}

        {member.bio ? (
          <Section title="Function & living situation">
            <p className="text-[14.2px] text-ink2 leading-[1.52]">{member.bio}</p>
          </Section>
        ) : null}

        {member.howInjured ? (
          <Section title="How it happened">
            <p className="text-[14.2px] text-ink2 leading-[1.52]">{member.howInjured}</p>
          </Section>
        ) : null}

        {member.interests.length ? (
          <Section title="Interests">
            <Chips items={member.interests} tone="outline" />
          </Section>
        ) : null}

        {member.selfCare.length ? (
          <Section title="Uses day to day">
            <Chips items={member.selfCare} tone="gold" />
          </Section>
        ) : null}

        <Section title="Details">
          <div className="rounded-[17px] border border-line bg-paper px-3.5 py-1">
            <DetailRow label="Independence" value={member.independence} />
            <DetailRow label="Work" value={member.employment} />
            <DetailRow label="Field" value={member.fieldOfWork} />
            <DetailRow label="Education" value={member.education} />
            <DetailRow
              label="Languages"
              value={member.languages.length ? member.languages.join(', ') : null}
            />
            <DetailRow
              label="Where"
              value={[member.city, member.state].filter(Boolean).join(', ') || null}
            />
          </div>
        </Section>

        {verifier ? (
          <Section title="Also a member of">
            {member.affiliations.map((org) => (
              <div
                key={org}
                className="mb-2 flex items-center gap-3 rounded-[14px] border border-line bg-paper p-3"
              >
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-gradient-to-br from-gold-dp to-gold font-extrabold font-head text-[11px] text-white">
                  {shortCodeFor(org)}
                </span>
                <span className="font-extrabold font-head text-[14.5px]">{org}</span>
              </div>
            ))}
          </Section>
        ) : null}

        {/* The provenance sentence is only true of the seeded directory rows.
            Somebody who signed up never published anything in a directory, and
            telling them they did is a small lie that undermines every other
            claim on the page. The contact promise applies to everybody, so it
            is the half that always shows. */}
        <div className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[12.6px] text-[#5C4409] leading-[1.5]">
          {member.isSeed ? (
            <>
              Everything here is what {member.displayName} chose to publish in the NorCal SCI mentor
              directory.{' '}
            </>
          ) : null}
          The club never shows a phone number, an address or an email — first contact always goes
          through a message.
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <p className="text-center text-[14px] text-ink2 leading-relaxed">{children}</p>
    </div>
  );
}
