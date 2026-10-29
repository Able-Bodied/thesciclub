import { Link, useLocation } from 'react-router-dom';
import { InviteRequestPanel, type PickedAdmin } from '@/routes/request-invite/request-panel';

/**
 * Asking for an invite, signed out (the owner, 2026-10-28; 20261029030000).
 * The list and the form are InviteRequestPanel's, shared with the blocked
 * screen.
 */
export default function RequestInvitePage() {
  const location = useLocation();
  // Chosen elsewhere already, by a tap that came here.
  const picked = (location.state as { picked?: PickedAdmin } | null)?.picked;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] bg-canvas px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Link to="/join" className="inline-block py-2 font-bold text-[0.875rem] text-emphasis">
        ← Back
      </Link>
      <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink leading-tight">
        Request an invite
      </h1>
      <InviteRequestPanel
        {...(picked ? { picked } : {})}
        done={
          <Link
            to="/join"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold"
          >
            Done
          </Link>
        }
      />
    </main>
  );
}
