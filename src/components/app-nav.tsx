import { NavLink } from 'react-router-dom';
import { ChatIcon, EventsIcon, HomeIcon, MeIcon, PeersIcon } from '@/components/nav-icons';
import { cn } from '@/lib/utils';

/**
 * The five-tab bottom bar, matching `nav()` in docs/index.html.
 *
 * Chat sits in the middle and is raised, which is the mock's shape — not a
 * statement about Chat's importance. Home and Chat are placeholder surfaces
 * for now (docs/CONTEXT.md); they are in the bar because leaving a hole there
 * would change every other tab's position once they land.
 */

const TABS = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/peers', label: 'Peers', Icon: PeersIcon },
  { to: '/chat', label: 'Chat', Icon: ChatIcon, middle: true },
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
      className="z-40 flex-none border-line border-t bg-paper px-2 pt-[7px] pb-[max(22px,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-5 gap-0.5">
        {TABS.map(({ to, label, Icon, ...rest }) => {
          const middle = 'middle' in rest && rest.middle;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-[3px] rounded-xl pt-[7px] pb-[3px] font-bold text-[10.2px]',
                  isActive ? 'text-navy' : 'text-grey',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      middle &&
                        '-mt-[13px] grid h-[42px] w-[42px] place-items-center rounded-[15px] shadow-[0_3px_10px_rgba(16,42,76,.14)]',
                      middle && (isActive ? 'bg-navy text-paper' : 'bg-tint'),
                    )}
                  >
                    <Icon className={cn('h-[22px] w-[22px]', isActive && '[stroke-width:2.3]')} />
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
