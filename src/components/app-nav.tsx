import { NavLink } from 'react-router-dom';
import { ChatIcon, EventsIcon, HomeIcon, MeIcon, PeersIcon } from '@/components/nav-icons';
import { cn } from '@/lib/utils';

/**
 * The five-tab bottom bar, matching `nav()` in docs/index.html.
 *
 * Home and Chat are placeholder surfaces for now (CONTEXT.md); they are
 * in the bar because leaving a hole there would change every other tab's
 * position once they land.
 *
 * ---------------------------------------------------------------------------
 * Chat is not raised
 * ---------------------------------------------------------------------------
 * The mock gives the middle tab a badge behind its icon and this bar carried
 * it for a while. It was removed: the badge is the strongest mark in the nav,
 * and it sat on the one tab that does nothing yet — so the bar pointed hardest
 * at the only place with nothing to find. The mock drew a finished app.
 *
 * It should come back with Chat itself, not before it.
 */

const TABS = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/peers', label: 'Peers', Icon: PeersIcon },
  { to: '/chat', label: 'Chat', Icon: ChatIcon },
  { to: '/events', label: 'Events', Icon: EventsIcon },
  { to: '/me', label: 'Me', Icon: MeIcon },
] as const;

export function AppNav() {
  // Bottom bar on a phone, top bar on a desktop.
  //
  // The five items still stay together rather than stretching: five tabs spread
  // across a 27-inch monitor read as a toolbar, and the targets end up nowhere
  // near each other. What changes is where the bar sits. A bottom tab bar is a
  // phone convention built around the thumb, and on a desktop it is the
  // furthest point from where somebody is reading, with no thumb to justify it.
  //
  // `order` rather than a second copy of the bar: the nav stays first in the
  // DOM, so it is first for a screen reader and first in the tab order at both
  // widths, and only its painted position moves.
  return (
    <nav
      aria-label="Main"
      className={cn(
        'z-40 order-last flex-none bg-paper px-2',
        'border-line border-t pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'md:order-first md:border-t-0 md:border-b md:px-4 md:pt-1.5 md:pb-1.5',
      )}
    >
      <div
        className={cn(
          'mx-auto grid w-full max-w-[480px] grid-cols-5 gap-0.5',
          'md:mx-0 md:flex md:max-w-none md:justify-start md:gap-1',
        )}
      >
        {TABS.map(({ to, label, Icon }) => {
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-0.5 rounded-xl pt-1 pb-0.5 font-bold text-[0.625rem]',
                  // Icon over label on a phone, beside it on a desktop, where
                  // the row is wide and the stacked label is needlessly small.
                  'md:flex-row md:gap-2 md:px-3 md:py-1.5 md:text-[0.875rem]',
                  isActive ? 'text-navy' : 'text-grey',
                  !isActive && 'md:hover:bg-tint',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Every item gets the same row height, so the five labels
                      sit on one line. */}
                  <span className="grid h-7 w-7 place-items-center rounded-[10px]">
                    <Icon className={cn('h-[20px] w-[20px]', isActive && '[stroke-width:2.3]')} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
