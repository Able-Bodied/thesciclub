import { SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrowseMembers } from '@/lib/members';
import { cn } from '@/lib/utils';
import { FilterSheet } from '@/routes/peers/filter-sheet';
import {
  activeFilterCount,
  citiesIn,
  filterMembers,
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
  const [segment, setSegment] = useState<PeersSegment>('everyone');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const deckRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);

  // No viewer yet — the signed-in member's own row arrives with onboarding.
  // rankMembers keeps the incoming order when the viewer is null.
  const viewer = null;

  const visible = useMemo(
    () => rankMembers(filterMembers(members, filters, segment), viewer),
    [members, filters, segment],
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
  const totalInSegment = filterMembers(members, EMPTY_MEMBER_FILTERS, segment).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto flex w-full max-w-[1100px] min-h-[38px] items-center justify-between gap-2.5">
          <h1 className="font-extrabold font-head text-[25px] text-ink tracking-[-0.02em]">
            Peers
          </h1>
          <button
            type="button"
            onClick={() => {
              setSheetOpen(true);
            }}
            aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
            className="relative grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-tint"
          >
            <SlidersHorizontal className="h-[17px] w-[17px] text-navy" strokeWidth={2} />
            {filterCount ? (
              <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
            ) : null}
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[1100px] gap-[7px] overflow-x-auto py-[11px] [scrollbar-width:none]">
          {SEGMENTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSegment(value);
              }}
              aria-pressed={segment === value}
              className={cn(
                'flex-none whitespace-nowrap rounded-full px-3.5 py-[7px] font-semibold text-[13.5px]',
                segment === value ? 'bg-navy text-white' : 'bg-tint text-ink2',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div
        ref={deckRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] lg:px-6"
      >
        {filters.search ? (
          <div className="mb-2.5">
            <button
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...f, search: '' }));
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy px-2.5 py-1.5 font-semibold text-[11.8px] text-white"
            >
              “{filters.search}”
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="px-6 py-10 text-center text-[14px] text-grey">Loading members…</p>
        ) : signedOut ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] text-ink2 leading-relaxed">
              The club is members only. Sign in to see who is here.
            </p>
            <p className="mt-2 text-[12.5px] text-grey leading-relaxed">
              Nothing inside the club is public.
            </p>
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] text-ink2 leading-relaxed">Could not load members.</p>
            <p className="mt-2 text-[12.5px] text-grey leading-relaxed">{error}</p>
          </div>
        ) : (
          <>
            <div className="mx-auto w-full max-w-[1100px]">
              <p className="mb-3 text-[12.5px] text-grey">
                {visible.length} of {totalInSegment} member{totalInSegment === 1 ? '' : 's'}
              </p>
              {/* One column on a phone, more as the shell widens. The gap
                  replaces the card's own bottom margin so rows and columns are
                  spaced the same. */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
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
              <p className="px-6 py-10 text-center text-[14px] text-grey leading-relaxed">
                Nobody matches that yet.
                <br />
                Try widening the filters.
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
