import { SlidersHorizontal } from 'lucide-react';

/**
 * The header's Filter, beside the search on Home, Peers and Events (the owner,
 * 2026-11-01): the word as well as the icon, which not everybody reads as a
 * filter. The dot says one is on; the count is in its name.
 */
export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Filters, ${count} active` : 'Filters'}
      className="relative flex h-11 flex-none items-center gap-1.5 rounded-full bg-tint px-3.5 font-bold text-[0.84375rem] text-emphasis transition-colors hover:bg-line"
    >
      <SlidersHorizontal aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2} />
      Filter
      {count ? (
        <span className="absolute top-[6px] right-[8px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
      ) : null}
    </button>
  );
}
