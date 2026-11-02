import { Search, X } from 'lucide-react';

/**
 * A search box in a screen's header, filling the row beside Filter (the owner,
 * 2026-11-01). Each letter filters what is below; there is no
 * button to press. 16px text, or Safari zooms the page when it is tapped.
 */
export function HeaderSearch({
  label,
  placeholder = 'Search',
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-[16px] w-[16px] text-grey"
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        aria-label={label}
        placeholder={placeholder}
        enterKeyHint="search"
        className="min-h-[44px] w-full rounded-full bg-tint py-2 pr-9 pl-9 text-[1rem] text-ink outline-none transition-colors placeholder:text-grey focus:bg-line [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
          }}
          aria-label="Clear the search"
          data-target="small"
          className="-translate-y-1/2 absolute top-1/2 right-2 grid h-[26px] w-[26px] place-items-center rounded-full text-grey transition-colors hover:bg-paper hover:text-ink"
        >
          <X aria-hidden="true" className="h-[15px] w-[15px]" />
        </button>
      ) : null}
    </div>
  );
}
