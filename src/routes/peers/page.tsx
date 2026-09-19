import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SegmentPills } from '@/components/segment-pills';
import { useBrowseMembers } from '@/lib/members';
import { useSession } from '@/lib/session';
import { FilterSheet } from '@/routes/peers/filter-sheet';
import {
  activeFilterCount,
  citiesIn,
  filterMembers,
  othersOnly,
  regionsIn,
  topicsIn,
} from '@/routes/peers/filters';
import { MemberCard } from '@/routes/peers/member-card';
import { rankMembers } from '@/routes/peers/ranking';
import {
  inEdgeGuard,
  nextSegment,
  startsInHorizontalScroller,
  swipeDirection,
} from '@/routes/peers/swipe';
import { EMPTY_MEMBER_FILTERS, type MemberFilters, type PeersSegment } from '@/types/domain';

/**
 * Peers — the deck of members, and the first thing somebody sees after joining.
 *
 * Everyone / Near me / Mentors are segment pills rather than separate tabs,
 * because at this card size a segment is a change of content and nothing else.
 * Horizontal swipe does the same thing as the pills; it is an accelerator and
 * never the only way through, because switch control, keyboard and VoiceOver
 * users cannot reliably swipe.
 */

const SEGMENTS: [PeersSegment, string][] = [
  ['everyone', 'Everyone'],
  ['near', 'Near me'],
  ['mentors', 'Mentors'],
];

export default function PeersPage() {
  const navigate = useNavigate();
  const { members, loading, error, signedOut } = useBrowseMembers();
  const session = useSession();
  const memberId = session.status === 'signed-in' ? session.userId : null;
  const [segment, setSegment] = useState<PeersSegment>('everyone');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const deckRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);

  // No viewer yet — the signed-in member's own row arrives with onboarding.
  // rankMembers keeps the incoming order when the viewer is null.
  const viewer = null;

  // Filtered once, before both the deck and the count below it, so the two
  // cannot disagree about who is in it.
  const others = useMemo(() => othersOnly(members, memberId), [members, memberId]);

  const visible = useMemo(
    () => rankMembers(filterMembers(others, filters, segment), viewer),
    [others, filters, segment],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || inEdgeGuard(touch.clientX)) {
      dragStart.current = null;
      return;
    }
    dragStart.current = { x: touch.clientX, y: touch.clientY, target: e.target as Element };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;

    const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
    if (!direction) return;
    if (startsInHorizontalScroller(start.target, deckRef.current, direction)) return;

    setSegment((current) => nextSegment(current, direction));
  }, []);

  const filterCount = activeFilterCount(filters);
  const totalInSegment = filterMembers(others, EMPTY_MEMBER_FILTERS, segment).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto flex w-full max-w-[1100px] min-h-[38px] items-center justify-between gap-2.5">
          <h1 className="font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
            Peers
          </h1>
          <button
            type="button"
            onClick={() => {
              setSheetOpen(true);
            }}
            aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
            // 34px, four smaller than the Events one that already had this and
            // the one control the setting was written for. It was missed.
            data-target="small"
            className="relative grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-tint transition-colors hover:bg-line"
          >
            <SlidersHorizontal className="h-[17px] w-[17px] text-navy" strokeWidth={2} />
            {filterCount ? (
              <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
            ) : null}
          </button>
        </div>

        {/* Under the filter control, above the segments, because that is the
            order the three narrow in: a name or a word first, then which slice
            of the club, then the sheet.

            The search itself is not new — `matchesSearch` has read across name,
            place, level, topics, interests and the free-text bio since the deck
            was built, and the page has always had a chip to *clear* a search.
            There was simply nothing that could set one, so the whole of it was
            unreachable. The chip is gone with this: an input that holds the
            words and carries its own ✕ says everything the chip said, in the
            place somebody looks to change it. */}
        <div className="mx-auto w-full max-w-[1100px] pt-2.5">
          <div className="relative">
            <Search
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-[16px] w-[16px] text-grey"
              strokeWidth={2}
            />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => {
                setFilters((f) => ({ ...f, search: e.target.value }));
              }}
              // Named for what it searches, not "Search". The field reads the
              // bio and the topics as well as the name, and somebody who
              // assumes it only matches names will not type "SmartDrive".
              aria-label="Search members by name, place, level or what they can be asked about"
              placeholder="Search members"
              // The webkit cancel button is suppressed because `type="search"`
              // draws one of its own, and with the ✕ below there were two
              // clears side by side. `type` stays `search` rather than `text`:
              // it is what gives the field the searchbox role and the right
              // keyboard, and a screenshot is the only thing that would ever
              // have shown the duplicate.
              className="min-h-[40px] w-full rounded-full border-[1.6px] border-line bg-canvas py-2 pr-9 pl-9 text-[0.875rem] text-ink outline-none transition-colors placeholder:text-grey focus:border-navy [&::-webkit-search-cancel-button]:appearance-none"
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => {
                  setFilters((f) => ({ ...f, search: '' }));
                }}
                aria-label="Clear the search"
                // 26px. The smallest control in the app.
                data-target="small"
                className="-translate-y-1/2 absolute top-1/2 right-2 grid h-[26px] w-[26px] place-items-center rounded-full text-grey transition-colors hover:bg-tint hover:text-ink"
              >
                <X className="h-[15px] w-[15px]" />
              </button>
            ) : null}
          </div>
        </div>

        <SegmentPills
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          className="max-w-[1100px]"
        />
      </header>

      <div
        ref={deckRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] md:px-6"
      >
        {loading ? (
          <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading members…</p>
        ) : signedOut ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[0.875rem] text-ink2 leading-relaxed">
              The club is members only. Sign in to see who is here.
            </p>
            <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">
              Nothing inside the club is public.
            </p>
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[0.875rem] text-ink2 leading-relaxed">Could not load members.</p>
            <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
          </div>
        ) : (
          <>
            <div className="mx-auto w-full max-w-[1100px]">
              <p className="mb-3 text-[0.78125rem] text-grey">
                {visible.length} of {totalInSegment} member{totalInSegment === 1 ? '' : 's'}
              </p>
              {/* One column on a phone, more as the shell widens. The gap
                  replaces the card's own bottom margin so rows and columns are
                  spaced the same. */}
              {/* The columns follow the shell, not the viewport. At `sm` the deck went
                  two-up while the shell was still capped at 480px, so two cards shared
                  a phone-width column and every name wrapped. */}
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    onOpen={() => {
                      void navigate(`/peers/${member.id}`);
                    }}
                  />
                ))}
              </div>
            </div>
            {visible.length === 0 ? (
              /* The advice names the lever that is actually holding the deck
                 shut. "Try widening the filters" was the only line here, and it
                 sends somebody into the sheet to loosen filters they may not
                 have set — the deck is far more often empty because of three
                 words in the search box. */
              <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
                Nobody matches that yet.
                <br />
                {filters.search
                  ? 'Try fewer words, or clear the search.'
                  : 'Try widening the filters.'}
              </p>
            ) : null}
          </>
        )}
      </div>

      {sheetOpen ? (
        <FilterSheet
          regions={regionsIn(members)}
          cities={citiesIn(members)}
          // Capped and frequency-ordered: the long tail of one-person topics
          // would bury the ones that actually narrow a deck.
          topics={topicsIn(members, 24)}
          filters={filters}
          matchCount={visible.length}
          activeCount={filterCount}
          onChange={setFilters}
          onClear={() => {
            setFilters(EMPTY_MEMBER_FILTERS);
          }}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
