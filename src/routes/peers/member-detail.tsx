import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { PhotoViewer } from '@/components/photo-viewer';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { unblockMember, useMyBlocks } from '@/lib/blocks';
import { useChatAuthors } from '@/lib/chat/authors';
import { reportMember, useMyReports } from '@/lib/chat/reports';
import { openDirect } from '@/lib/chat/threads';
import { describeThrown } from '@/lib/describe-error';
import { injuryDateLabel, timeSinceLabel } from '@/lib/injury';
import { useBrowseMember } from '@/lib/members';
import { organizationByName, useOrganizations } from '@/lib/organizations';
import { usePhotoUrl } from '@/lib/photos';
import { ContinueInRooms } from '@/routes/chat/continue-in-room';
import { ItemActions } from '@/routes/chat/item-actions';
import { ReportSheet } from '@/routes/chat/report-sheet';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { BlockMemberSheet } from '@/routes/peers/block-sheet';
import { gradientFor, initialsOf, summaryLine } from '@/routes/peers/member-card';
import { RepresentationTags } from '@/routes/peers/representation-tags';
import type { BeforeAfter, BrowseMember } from '@/types/domain';

/**
 * One member's full profile — where a tapped card lands.
 *
 * Laid out after the mock's peer page: the photo as a hero with the name over
 * it, then the things members actually search on, then the flatter biographical
 * detail. Sections render only when there is something in them, so a sparse
 * profile reads as short rather than as broken.
 *
 * The one action is Message. The mock also has "Ask <name>", which was never
 * built and which the owner does not want; a control that opens nothing is
 * worse than no control. Report and Block are in the •••.
 */

/**
 * "Children", for the details card.
 *
 * Whether somebody became a parent before or after their injury is the part a
 * peer is actually reaching for. Raising a child you already had and learning
 * to parent from a chair from the start are different experiences, and they
 * draw different questions — so the survey has asked it all along
 * (`children_when`, Before/After/Both) and no screen showed the answer.
 *
 * Only rendered for members who said yes. A row reading "Children: No" is not
 * the fact this exists to carry, and nobody answering a yes/no about their
 * family asked for the negative to be published on their profile.
 */
export function childrenLabel(
  hasChildren: boolean | null,
  when: BeforeAfter | null,
): string | null {
  if (hasChildren !== true) return null;
  if (when === 'Before') return 'Yes — before the injury';
  if (when === 'After') return 'Yes — since the injury';
  if (when === 'Both') return 'Yes — before and since the injury';
  return 'Yes';
}

/**
 * What the back button calls the place it returns to.
 *
 * It goes to `navigate(-1)` either way — browser history is the honest answer
 * to "back" and it always was. The label is the part that can be wrong: Me now
 * links here so a member can see their own card, and a button reading "Peers"
 * that lands you on Me is a small lie told on every visit.
 */
export function backFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (from === 'me') return 'Me';
  // A city's members, from the map on Events.
  if ((state as { view?: unknown } | null)?.view === 'map') return 'Events';
  // A photograph's author or a member worth meeting, opened from Home.
  if (from === 'home') return 'Home';
  return 'Peers';
}

/**
 * Message, and where it goes.
 *
 * `chat_open_direct` returns the conversation these two already have or makes
 * it, so this is safe to press twice — `direct_key` is unique and the function
 * re-selects rather than racing. Nothing is created client-side and no id is
 * derived here.
 *
 * Not drawn on your own card, which Me links to. A conversation with yourself
 * is refused by the database in a sentence, and a button whose only outcome is
 * that sentence should not be on the screen.
 *
 * A refusal is printed under the button rather than swallowed. The one that
 * will actually happen is a suspended member, who reads and does not write.
 */
function MessageButton({ memberId, name }: { memberId: string; name: string }) {
  const account = useAccount();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!account.userId || account.userId === memberId) return null;

  return (
    <div>
      <button
        type="button"
        disabled={opening}
        onClick={() => {
          setOpening(true);
          setFailure(null);
          void openDirect(memberId)
            .then((result) => {
              if (!result.ok) {
                setFailure(result.error);
                setOpening(false);
                return;
              }
              void navigate(`/chat/t/${result.value}`);
            })
            .catch((e: unknown) => {
              setFailure(describeThrown(e, 'That did not work.'));
              setOpening(false);
            });
        }}
        // The mock's `btn gold`. Gold is the club's one accent and this is the
        // one action on the page.
        className="flex min-h-[46px] w-full items-center justify-center rounded-[13px] bg-gold px-4 font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-50"
      >
        {opening ? 'Opening…' : `Message ${name}`}
      </button>
      {failure ? (
        <p role="alert" className="mt-2 text-[0.78125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled row in the details card, skipped entirely when empty. */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 border-line border-b py-3 last:border-b-0">
      <span className="w-[104px] flex-none text-[0.78125rem] text-grey">{label}</span>
      <span className="text-[0.85rem] leading-[1.42]">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // `flow-root`, so the heading and what is under it move past the floated
    // picture together. As loose siblings, a heading whose line landed in the
    // float's last few pixels sat beside the photograph while its chips, a
    // block, dropped below it at full width — "Interests" in one column and
    // Cycling · Volunteering in the other. One block is placed beside the
    // float or below it, never both.
    <div className="flow-root">
      <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone: 'solid' | 'outline' | 'gold' }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold-lt text-gold-dp'
      : tone === 'outline'
        ? 'border border-line text-ink2'
        : 'bg-tint text-emphasis';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full px-2.5 py-[5px] font-semibold text-[0.7375rem] leading-[1.25] ${cls}`}
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

/**
 * A member the viewer blocked has no profile for them (20261022060000), so
 * this page says so instead, with Unblock.
 */
export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const blocks = useMyBlocks();
  const [justBlocked, setJustBlocked] = useState(false);
  if (blocks.loading) return <Centered role="status">Loading…</Centered>;
  if (id && blocks.ids.has(id)) {
    return <BlockedProfile id={id} focusHeading={justBlocked} onUnblocked={blocks.reload} />;
  }
  return (
    <MemberProfile
      // Read again after Unblock: the profile was hidden until now.
      key={blocks.blocked.length}
      onBlocked={() => {
        setJustBlocked(true);
        blocks.reload();
      }}
    />
  );
}

/** The ••• over a profile's photograph: white on a phone, as the back link is. */
const ACTIONS_BUTTON =
  'text-white drop-shadow-[0_1px_2px_rgba(10,29,54,0.6)] hover:bg-white/15 lg:text-grey lg:drop-shadow-none lg:hover:bg-tint';

function BlockedProfile({
  id,
  focusHeading,
  onUnblocked,
}: {
  id: string;
  focusHeading: boolean;
  onUnblocked: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const announce = useAnnounce();
  const author = useChatAuthors([id]).get(id);
  const name = author?.displayName ?? 'This member';
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  function unblock() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    void unblockMember(id).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      announce(`Unblocked ${name}.`);
      onUnblocked();
    });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] px-4 pt-3 pb-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              void navigate(-1);
            }}
            className="-ml-1.5 inline-flex min-h-[44px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-emphasis"
          >
            <ChevronLeft className="h-4 w-4" />
            {backFrom(location.state)}
          </button>
          <ItemActions what={name} title="Member actions">
            <button type="button" onClick={unblock}>
              Unblock {name}
            </button>
          </ItemActions>
        </div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-4 font-extrabold font-display text-[1.875rem] text-ink leading-tight outline-none"
        >
          {name}
        </h1>
        <p className="mt-3 text-[0.9375rem] text-ink2 leading-[1.55]">
          You blocked {name}. You don't see anything they post or send, and neither of you can
          message the other. They have not been told.
        </p>
        <button
          type="button"
          onClick={unblock}
          disabled={busy}
          className="mt-5 min-h-[48px] w-full rounded-[13px] bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line disabled:opacity-50"
        >
          {busy ? 'Unblocking…' : `Unblock ${name}`}
        </button>
        {failure ? (
          <p role="alert" className="mt-2 text-[0.875rem] text-destructive leading-[1.45]">
            {failure}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MemberProfile({ onBlocked }: { onBlocked: () => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { member, loading, error, signedOut, notFound } = useBrowseMember(id);
  // Before the early returns: hooks cannot run conditionally, and every
  // branch below this either renders the profile or does not need the list.
  const { organizations } = useOrganizations();
  const account = useAccount();
  const photo = usePhotoUrl(member?.photoPath);
  // The whole photograph, uncropped, over the page (the owner, 2026-10-15).
  const [photoOpen, setPhotoOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const reports = useMyReports();
  const announce = useAnnounce();
  // Focus goes back here on close: Safari does not focus a button it clicks.
  const photoButton = useRef<HTMLButtonElement | null>(null);
  // The ••• that opened the report sheet. The menu closes under it, so the
  // sheet has no opener to give focus back to.
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const wasReporting = useRef(false);
  useEffect(() => {
    if (wasReporting.current && !reporting) menuButton.current?.focus();
    wasReporting.current = reporting;
  }, [reporting]);

  if (loading) {
    return <Centered role="status">Loading…</Centered>;
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
  const verifier = member.affiliations[0] ?? null;
  const injury = injuryLine(member);
  const canMessage = account.userId !== null && account.userId !== member.id;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="relative mx-auto w-full max-w-[62rem] lg:px-4 lg:pt-3">
        {/* The way back on the left and, for a mentor, a gold chip on the
            right — the deck's own colour for the word.

            On a phone the row lies over the top of the photograph (owner,
            2026-09-21, reversing the morning's "above it, not on it"): the
            strip it took above the picture was 58px of nothing, and the
            picture is the point of this screen. White, over a scrim, so it
            reads on a bright sky. From `lg` the picture is a floated card and
            the row goes back above everything, in navy on the canvas. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-3 lg:static lg:px-0 lg:pt-0 lg:pb-2.5">
          <button
            type="button"
            onClick={() => {
              void navigate(-1);
            }}
            className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-white drop-shadow-[0_1px_2px_rgba(10,29,54,0.6)] lg:text-emphasis lg:drop-shadow-none"
            data-target="small"
          >
            <ChevronLeft className="h-4 w-4" />
            {backFrom(location.state)}
          </button>
          {/* An administrator's profile is their own, with an Admin chip
              beside Peer mentor (the owner, 2026-10-01); it was the club's
              "official account" page until administrators were people. */}
          <span className="flex items-center gap-1.5">
            {member.type !== 'peer' || member.isAdmin ? (
              <span className="flex flex-wrap justify-end gap-1.5">
                {member.type === 'mentor' ? (
                  <span className="inline-flex items-center rounded-full bg-gold px-2.5 py-[5px] font-extrabold font-head text-on-gold text-[0.6875rem] uppercase tracking-[0.08em]">
                    Peer mentor
                  </span>
                ) : null}
                {member.type === 'organization' ? (
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-[5px] font-bold text-[0.6875rem] text-navy uppercase">
                    Organization
                  </span>
                ) : null}
                {member.isAdmin ? (
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-[5px] font-extrabold font-head text-[0.6875rem] text-navy uppercase tracking-[0.08em] lg:bg-action lg:text-white">
                    Admin
                  </span>
                ) : null}
              </span>
            ) : null}
            {canMessage ? (
              <ItemActions
                what={member.displayName}
                title="Member actions"
                buttonClassName={ACTIONS_BUTTON}
                buttonRef={menuButton}
              >
                {reports.memberIds.has(member.id) ? (
                  <p className="flex min-h-11 items-center px-3 text-grey text-sm">
                    You reported {member.displayName}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReporting(true);
                    }}
                  >
                    Report {member.displayName}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBlocking(true);
                  }}
                >
                  Block {member.displayName}
                </button>
              </ItemActions>
            ) : null}
          </span>
        </div>
        {reporting ? (
          <ReportSheet
            kind="profile"
            overPage
            onCancel={() => {
              setReporting(false);
            }}
            onSend={async (note) => {
              const result = await reportMember(member.id, note);
              if (!result.ok) return result.error;
              // Read back what the database holds rather than assuming it took.
              reports.reload();
              announce(`You reported ${member.displayName}. They have not been told.`);
              setReporting(false);
              return null;
            }}
          />
        ) : null}
        {blocking ? (
          <BlockMemberSheet
            memberId={member.id}
            name={member.displayName}
            onCancel={() => {
              setBlocking(false);
            }}
            onBlocked={onBlocked}
          />
        ) : null}
        {/*
         * From `lg` the picture is floated, not a column: the profile runs
         * beside it and then takes the whole width once it is past the bottom
         * of the photograph.
         *
         * It was a two-column grid, which fixed the picture's column at 20rem
         * and gave the rest of the page the other one. That kept every profile
         * the same shape — the reason it was built that way, and still worth
         * having — but the left column ended with the photograph and the page
         * carried on for another 776 measured pixels beside an empty strip.
         *
         * The float keeps the fixed 20rem so the shape is still constant, and
         * spends the space underneath on the profile instead of on nothing.
         */}
        <div className="lg:block">
          <div className="lg:float-left lg:mr-8 lg:mb-3 lg:w-[20rem] lg:overflow-hidden lg:rounded-[26px] lg:shadow-[0_10px_26px_rgba(10,20,35,.18)]">
            {/* The mock's `phero`: the photograph as a 300px hero with the
             * name over its foot, edge to edge on a phone. The mock also puts
             * the back button and a badge with an organization mark on the
             * picture; the owner moved both above it and dropped the mark. */}
            {/*
             *
             * It used to be the whole photograph, uncropped, with the name
             * underneath, on the argument that a profile is where somebody
             * actually looks at the person. The owner asked for the mock's
             * shape instead (2026-09-21), and the deck already crops these to a
             * tall card, so a crop is nothing a member has not already seen.
             * The face is kept by `object-position` at 26% from the top — the
             * deck uses 28% — which is where a portrait's face sits.
             *
             * 350px and not a share of the viewport. Most members open this in
             * a browser, where the URL bar takes its cut of the height before
             * the page gets any; a `vh` hero is either too tall there or too
             * short in the installed app. A fixed height leaves the name and
             * the button on the first screen in both. It was 300 with a 58px
             * row above it; the row now lies on the picture, and the picture
             * has the room it took.
             *
             * From `lg` it is the 20rem picture the float always had, 4:5
             * rather than 300px, with the same overlay — one DOM for every
             * width rather than a hidden twin of the name. */}
            <div
              className="relative h-[350px] overflow-hidden lg:aspect-[4/5] lg:h-auto"
              style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 grid place-items-center font-extrabold font-display text-[6.5rem] text-white opacity-[0.13]"
              >
                {initialsOf(member.displayName)}
              </span>
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[50%_26%]"
                  onError={(e) => {
                    e.currentTarget.remove();
                  }}
                />
              ) : null}
              {/* A short scrim at the top for the back button and the chip
                  that lie on the picture on a phone; gone from `lg`, where
                  they are above it. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[90px] bg-gradient-to-b from-black/50 to-transparent lg:hidden"
              />
              {/* Clear at the top, a neutral shade at the foot (the owner,
                  2026-10-13: not navy, so the photo keeps its colours), so the
                  name reads on a light photograph and on the gradient alike. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[190px] bg-gradient-to-b from-transparent via-black/55 via-60% to-black/75"
              />
              {/* The hero crops the photograph to a banner. Pressing it shows
                  the whole of it, and zooms (src/components/photo-viewer.tsx).
                  A layer over the picture rather than round it, so the name
                  over its foot is pressed through, not in the way. */}
              {photo ? (
                <button
                  ref={photoButton}
                  type="button"
                  aria-label={`Open ${member.displayName}’s photograph`}
                  onClick={(event) => {
                    photoButton.current = event.currentTarget;
                    setPhotoOpen(true);
                  }}
                  className="absolute inset-0 cursor-zoom-in"
                />
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 px-[18px] pb-3.5">
                <h1 className="font-extrabold font-display text-[1.875rem] text-white leading-tight tracking-[-0.01em]">
                  {member.displayName}
                </h1>
                {member.username ? (
                  <p className="mt-0.5 font-semibold text-[0.9375rem] text-white">
                    @{member.username}
                  </p>
                ) : null}
                <p className="mt-1 text-[0.875rem] text-white">{summaryLine(member)}</p>
                {injury ? <p className="mt-0.5 text-[0.78125rem] text-white/90">{injury}</p> : null}
              </div>
            </div>

            {photoOpen && photo ? (
              <PhotoViewer
                url={photo}
                // Their own description, when they wrote one.
                label={
                  member.photoAlt?.trim()
                    ? member.photoAlt.trim()
                    : `Photograph of ${member.displayName}`
                }
                title={`${member.displayName}’s photograph`}
                index={0}
                count={1}
                onStep={() => undefined}
                onClose={() => {
                  setPhotoOpen(false);
                  photoButton.current?.focus();
                }}
              />
            ) : null}

            {/* One gold button straight under the photograph, on the page
                (the owner, 2026-10-13: no band behind it). Full width; from
                `lg` it closes the floated card on paper. Not drawn on your
                own profile, where there is nothing to press. */}
            {canMessage ? (
              <div className="px-[18px] pt-4 lg:bg-paper lg:pb-4">
                <MessageButton memberId={member.id} name={member.displayName} />
              </div>
            ) : null}
          </div>

          {/* `contents` at lg so the sections below become siblings of the
              floated picture and flow past it one at a time. Wrapped in a box
              of their own they would all sit beside it or all below it, which
              is the grid this replaced. */}
          <div className="min-w-0 px-4 lg:contents">
            <RepresentationTags organizations={member.representedOrganizations} />
            {/* The owner's order, 2026-10-10: who they are in their own words,
                then how it happened, then what they will talk about and do,
                then the flatter details card. "Bio" because that is what the
                survey now asks for ("Brief bio"). */}
            {member.bio ? (
              <Section title="Bio">
                <p className="text-[0.8875rem] text-ink2 leading-[1.52]">
                  <LinkedText text={member.bio} />
                </p>
              </Section>
            ) : null}

            {member.howInjured ? (
              <Section title="How it happened">
                <p className="text-[0.8875rem] text-ink2 leading-[1.52]">{member.howInjured}</p>
              </Section>
            ) : null}

            {member.topics.length ? (
              <Section title="Happy to talk about">
                <p className="-mt-1 mb-2.5 text-[0.78125rem] text-grey leading-[1.45]">
                  What {member.displayName} offered to be asked about.
                </p>
                <Chips items={member.topics} tone="solid" />
              </Section>
            ) : null}

            {member.interests.length ? (
              <Section title="Interests">
                <Chips items={member.interests} tone="outline" />
              </Section>
            ) : null}

            {/* "The specifics" from the survey, under the self-care answers it
                spells out — which program, which modifications, which device.
                It was collected and never shown, though the survey tells the
                member it is what people message them about. */}
            {member.selfCare.length || member.detail ? (
              <Section title="Uses day to day">
                {member.selfCare.length ? <Chips items={member.selfCare} tone="gold" /> : null}
                {member.detail ? (
                  <p
                    className={`${member.selfCare.length ? 'mt-2.5 ' : ''}text-[0.8875rem] text-ink2 leading-[1.52]`}
                  >
                    <LinkedText text={member.detail} />
                  </p>
                ) : null}
              </Section>
            ) : null}

            {member.sportsEquipment ? (
              <Section title="Adaptive sports equipment">
                <p className="text-[0.8875rem] text-ink2 leading-[1.52]">
                  <LinkedText text={member.sportsEquipment} />
                </p>
              </Section>
            ) : null}

            {member.grants ? (
              <Section title="Grants">
                <p className="text-[0.8875rem] text-ink2 leading-[1.52]">
                  <LinkedText text={member.grants} />
                </p>
              </Section>
            ) : null}

            <Section title="Details">
              {/* `flow-root` so the card sits beside the floated picture and
                  narrows, instead of sliding its border underneath it. A plain
                  block only wraps its text around a float; a bordered box has
                  to be told to keep out of the way. */}
              <div className="flow-root rounded-[17px] border border-line bg-paper px-3.5 py-1">
                <DetailRow label="Independence" value={member.independence} />
                <DetailRow label="Work" value={member.employment} />
                <DetailRow label="Field" value={member.fieldOfWork} />
                <DetailRow label="Education" value={member.education} />
                <DetailRow
                  label="Children"
                  value={childrenLabel(member.hasChildren, member.childrenWhen)}
                />
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
              <Section title="Member of">
                {member.affiliations.map((org) => {
                  const known = organizationByName(organizations, org);
                  const row = (
                    <>
                      <OrganizationBadge
                        organization={known}
                        hostName={org}
                        className="h-[34px] w-[34px] rounded-[11px] text-[0.6875rem]"
                      />
                      <span className="font-extrabold font-head text-[0.90625rem]">{org}</span>
                    </>
                  );
                  const box =
                    'mb-2 flex flow-root items-center gap-3 rounded-[14px] border border-line bg-paper p-3';
                  // A link where the club has the organization's page.
                  return known ? (
                    <Link
                      key={org}
                      to={`/events/organizations/${known.id}`}
                      className={`${box} transition-colors hover:bg-tint`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={org} className={box}>
                      {row}
                    </div>
                  );
                })}
              </Section>
            ) : null}

            {/* The rooms this member's topics reach, after everything about
                the member: the page is for reading the person, and these were
                taking the first screen of it on a phone (owner, 2026-10-07).
                Draws nothing — heading included — unless a topic reaches a
                room that is open, which for most of this club's life is
                nothing. */}
            <ContinueInRooms
              topics={member.topics}
              wrap={(links) => <Section title="Talk about it in the club">{links}</Section>}
            />

            {/* The provenance sentence is only true of the seeded directory rows.
            Somebody who signed up never published anything in a directory, and
            telling them they did is a small lie that undermines every other
            claim on the page, so for them there is no box at all. (It used to
            carry a second sentence about contact details, removed 2026-10-10.) */}
            {member.isSeed ? (
              <div className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[0.7875rem] text-gold-ink leading-[1.5]">
                Everything here is what {member.displayName} chose to publish in the NorCal SCI
                mentor directory.
              </div>
            ) : null}
          </div>
        </div>
        <div className="h-6" />
      </div>
    </div>
  );
}

function Centered({ children, role }: { children: React.ReactNode; role?: 'status' }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <p role={role} className="text-center text-[0.875rem] text-ink2 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
