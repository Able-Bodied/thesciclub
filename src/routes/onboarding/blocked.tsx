import { ShieldCheck } from 'lucide-react';
import { useOrganizations } from '@/lib/organizations';
import { OrganizationBadge } from '@/routes/events/organization-badge';

/**
 * The number verified, and it is not on the list.
 *
 * Written as a closed door rather than as an error, because it is one. It names
 * the organizations who can open it, so somebody who wants in knows exactly
 * what to do next — a dead end with no route out of it is the thing that makes
 * an invite-only product feel like a snub rather than a club.
 *
 * ---------------------------------------------------------------------------
 * The list is read, not written here
 * ---------------------------------------------------------------------------
 * It used to be three hardcoded rows. That was wrong the moment Wheel with Me
 * stopped being able to issue invites: this screen would have kept telling a
 * newly injured person to contact a foundation that cannot add them, at the
 * worst possible moment to be sent to the wrong place.
 *
 * `can_invite` is the one fact that decides who belongs here, so the screen
 * asks the database for it. `organizations` is public-read, which is what makes
 * that possible on a screen nobody is signed in to yet.
 *
 * When the query fails there is no fallback list, deliberately. The sentence
 * above it still says a member organization or a mentor has to add the number,
 * and "Try another number" still works — a shorter true page beats a complete
 * one that might name the wrong body.
 */

export function BlockedScreen({ onTryAnother }: { onTryAnother: () => void }) {
  const { organizations, loading } = useOrganizations();
  const vouchers = organizations.filter((organization) => organization.canInvite);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto px-[18px] pt-12">
        <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-gold-lt text-gold-dp">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-extrabold font-head text-[1.5625rem] text-ink leading-tight tracking-[-0.02em]">
          This number isn't on the list
        </h1>
        <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">
          The club is closed. A member organization or a peer mentor has to add your number before
          you can join — the app itself cannot let you in.
        </p>

        {loading || vouchers.length > 0 ? (
          <div className="mt-4 min-h-[60px] rounded-[17px] border border-line bg-paper px-3.5">
            {vouchers.map((organization) => (
              <div
                key={organization.id}
                className="flex gap-3 border-line border-b py-3.5 last:border-b-0"
              >
                {/* The same badge the events screens use, rather than a
                    second hand-rolled gold tile that could only ever show
                    initials. Somebody being turned away recognises NorCal
                    SCI's logo faster than they read three letters, and this
                    is the screen where knowing who to contact is the whole
                    point. It falls back to the tile on its own. */}
                <OrganizationBadge organization={organization} />
                <span className="min-w-0">
                  <span className="block font-extrabold font-head text-[0.875rem]">
                    {organization.name}
                  </span>
                  {/* Clamped: these descriptions are written for the
                      organization's own page, and this screen wants the name,
                      the place, and enough to recognise it by — not a
                      paragraph somebody has to read while being turned away. */}
                  <span className="mt-0.5 line-clamp-2 block text-[0.78125rem] text-grey leading-[1.42]">
                    {organization.description}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-grey">{organization.city}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-[0.78125rem] text-grey leading-[1.5]">
          If a member gave you a QR code, it gets you the app — it does not get you in. Someone
          still has to add your number.
        </p>
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onTryAnother}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem]"
        >
          Try another number
        </button>
      </footer>
    </div>
  );
}
