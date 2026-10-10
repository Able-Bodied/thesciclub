import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Tabs that divide one screen into parts, for Me and Admin.
 *
 * Not SegmentPills. A segment filters the list below it; these replace the
 * whole of what is below, so they are real tabs with panels, and a screen
 * reader says "tab, 2 of 3" rather than "toggle button, pressed".
 *
 * Kept in the address (`?tab=`) so that a refresh, or the installed app
 * reopening where it was left, comes back to the same part. Replaced rather
 * than pushed: a phone's back gesture leaves the screen, as it does everywhere
 * else in the club, instead of stepping back through tabs.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T, initial?: T) {
  const [params, setParams] = useSearchParams();
  // Read from the address once, then held here. Other parts of a screen tidy
  // their own parameters away (Google's return to Me does), and the tab must
  // not jump back to the first when they do.
  const [tab, setTabState] = useState<T>(
    () => tabs.find((value) => value === params.get('tab')) ?? initial ?? fallback,
  );
  const setTab = useCallback(
    (next: T) => {
      setTabState(next);
      setParams(
        (current) => {
          if (next === fallback) current.delete('tab');
          else current.set('tab', next);
          return current;
        },
        { replace: true },
      );
    },
    [fallback, setParams],
  );
  return [tab, setTab] as const;
}

export interface PageTab<T extends string> {
  value: T;
  label: string;
  /** A count drawn beside the label. Zero is not drawn. */
  count?: number;
  /** What the count means, for a screen reader: "waiting". */
  countLabel?: string;
}

/**
 * The tab row. Sticks to the top of the screen's scroller, so on a long list
 * the other parts are one tap away rather than a scroll back up.
 *
 * `fill` shares the width equally, for a few short labels (Me). Without it the
 * row scrolls sideways rather than wrapping (Admin): wrapped, five tabs took
 * two rows and a quarter of a phone at larger text, and the second row read as
 * a different control. The fade at the end says there is more to the right.
 */
export function PageTabs<T extends string>({
  id,
  tabs,
  value,
  onChange,
  label,
  fill = false,
  measure = 'max-w-[var(--events-measure)]',
}: {
  /** Shared with each TabPanel, which is how a panel names its tab. */
  id: string;
  tabs: readonly PageTab<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  fill?: boolean;
  /** The max-width class the screen's content uses, so the tabs line up with it. */
  measure?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);

  // The chosen tab, brought into view in a row that scrolls: one deep-linked
  // to Rooms would otherwise be lit off the edge of a phone.
  useEffect(() => {
    const list = row.current;
    const selected = document.getElementById(tabId(id, value));
    if (!list || !selected) return;
    const left = selected.offsetLeft - list.offsetLeft;
    if (
      left < list.scrollLeft ||
      left + selected.offsetWidth > list.scrollLeft + list.clientWidth
    ) {
      list.scrollLeft = left - 16;
    }
  }, [id, value]);

  function choose(next: T) {
    if (next !== value) onChange(next);
    // Somebody far down one tab who opens another starts at its top, under the
    // tabs, rather than part-way down a list they have not seen. Nothing moves
    // for somebody who has not scrolled past the tabs.
    const mark = sentinel.current;
    if (mark && mark.getBoundingClientRect().top < 0) mark.scrollIntoView({ block: 'start' });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.value === value);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const target = next === null ? undefined : tabs[next];
    if (next === null || !target) return;
    event.preventDefault();
    choose(target.value);
    row.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <div className="sticky top-0 z-20 flex-none border-line border-b bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <div
          ref={row}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            'mx-auto flex w-full gap-1.5 px-4 py-2',
            measure,
            !fill &&
              'overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none] md:pr-4 md:[mask-image:none]',
          )}
        >
          {tabs.map((tab) => {
            const selected = tab.value === value;
            const counted = tab.count !== undefined && tab.count > 0;
            return (
              <button
                key={tab.value}
                id={tabId(id, tab.value)}
                type="button"
                role="tab"
                aria-selected={selected}
                // The count said in words: a bare "Reports 2" is not a sentence.
                aria-label={
                  counted
                    ? `${tab.label}, ${tab.count}${tab.countLabel ? ` ${tab.countLabel}` : ''}`
                    : undefined
                }
                aria-controls={panelId(id, tab.value)}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  choose(tab.value);
                }}
                className={cn(
                  'flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 font-semibold text-[0.875rem] transition-colors',
                  fill ? 'min-w-0 flex-1' : 'flex-none',
                  selected ? 'bg-action text-white' : 'text-ink2 hover:bg-tint',
                )}
              >
                {tab.label}
                {counted ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'min-w-[1.6em] rounded-full px-1.5 py-px text-center font-bold text-[0.75rem]',
                      selected ? 'bg-white text-action' : 'bg-destructive-fill text-white',
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** One tab's part of the screen. Only the chosen one is drawn. */
export function TabPanel({
  id,
  value,
  children,
  className,
}: {
  id: string;
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id={panelId(id, value)}
      role="tabpanel"
      aria-labelledby={tabId(id, value)}
      className={className}
    >
      {children}
    </div>
  );
}

function tabId(base: string, value: string) {
  return `${base}-tab-${value}`;
}

function panelId(base: string, value: string) {
  return `${base}-panel-${value}`;
}
