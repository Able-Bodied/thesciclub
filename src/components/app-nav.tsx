import { NavLink } from 'react-router-dom';
import { ChatIcon, EventsIcon, HomeIcon, MeIcon, PeersIcon } from '@/components/nav-icons';
import { cn } from '@/lib/utils';

/**
 * The five-tab bottom bar, matching `nav()` in docs/index.html.
 *
 * Home and Chat are placeholder surfaces for now (docs/CONTEXT.md); they are
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
  // The bar spans the shell, but its five items stay together at phone width.
  // Five tabs stretched across a desktop monitor read as a toolbar rather than
  // a tab bar, and the targets end up nowhere near each other.
  return (
    <nav
      aria-label="Main"
      className="z-40 flex-none border-line border-t bg-paper px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-5 gap-0.5">
        {TABS.map(({ to, label, Icon }) => {
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-0.5 rounded-xl pt-1 pb-0.5 font-bold text-[0.625rem]',
                  isActive ? 'text-navy' : 'text-grey',
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
