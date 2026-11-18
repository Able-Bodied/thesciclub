import { TAB_ROOTS } from '@/lib/back-trail';
import { backToHome } from '@/routes/home/back';

/**
 * The tab a screen belongs to. A topic, an event or a profile opened from a
 * card on Home belongs to Home — its back link says Home and goes there — so
 * Home is lit rather than Chat, Events or Peers, whose paths those screens
 * live under. Otherwise a tab is lit on its own path and everything beneath
 * it, as NavLink would.
 */
export function litTab(pathname: string, state: unknown): string | null {
  if (backToHome(state) !== null) return '/home';
  return (
    Object.keys(TAB_ROOTS).find((to) => pathname === to || pathname.startsWith(`${to}/`)) ?? null
  );
}
