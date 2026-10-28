import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { grantMentor, revokeMentor } from '@/lib/organization-mentors';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { RepresentedOrganization } from '@/types/domain';

/**
 * On a member's profile, for the admins of an organization (the owner,
 * 2026-10-28): make them a mentor of that organization, or stop. One row for
 * each organization the viewer is an org admin of; nothing for anybody else,
 * or on their own profile. The database decides again (grant_mentor).
 */
export function MentorControls({
  memberId,
  displayName,
  mentorOf,
  onChange,
}: {
  memberId: string;
  displayName: string;
  mentorOf: RepresentedOrganization[];
  onChange: (next: RepresentedOrganization[]) => void;
}) {
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;
  const mine = useMyOrganizations(viewerId);
  const { byId } = useOrganizations();
  const announce = useAnnounce();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!viewerId || viewerId === memberId) return null;
  const organizations = [...mine.ids]
    .map((id) => byId.get(id))
    .filter((organization) => organization !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (organizations.length === 0) return null;

  function toggle(organization: RepresentedOrganization, isMentor: boolean) {
    setBusy(organization.id);
    setError(null);
    void (isMentor ? revokeMentor : grantMentor)(organization.id, memberId).then((result) => {
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? 'That did not work.');
        return;
      }
      const mark: RepresentedOrganization = {
        id: organization.id,
        name: organization.name,
        shortCode: organization.shortCode,
        logoPath: organization.logoPath,
      };
      onChange(
        isMentor
          ? mentorOf.filter((o) => o.id !== organization.id)
          : [...mentorOf.filter((o) => o.id !== organization.id), mark],
      );
      announce(
        isMentor
          ? `${displayName} is no longer a mentor of ${organization.name}.`
          : `${displayName} is now a mentor of ${organization.name}.`,
      );
    });
  }

  return (
    <section
      aria-labelledby={`mentor-controls-${memberId}`}
      className="mt-4 mb-3 rounded-[14px] border border-line bg-paper p-3.5"
    >
      <h2
        id={`mentor-controls-${memberId}`}
        className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        As an org admin
      </h2>
      <ul className="mt-2 space-y-2">
        {organizations.map((organization) => {
          const isMentor = mentorOf.some((o) => o.id === organization.id);
          return (
            <li key={organization.id} className="flex items-center gap-3">
              <OrganizationBadge organization={organization} />
              <span className="min-w-0 flex-1 text-[0.875rem] text-ink leading-[1.4]">
                {isMentor
                  ? `A mentor of ${organization.name}`
                  : `Not a mentor of ${organization.name}`}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                aria-label={`${isMentor ? 'Remove as mentor' : 'Make mentor'} of ${organization.name}`}
                onClick={() => {
                  toggle(organization, isMentor);
                }}
                className={cn(
                  'flex min-h-11 flex-none items-center gap-1.5 rounded-xl px-3.5 font-bold font-head text-[0.8125rem] transition-colors disabled:opacity-50',
                  isMentor
                    ? 'border-[1.6px] border-line text-ink hover:bg-tint'
                    : 'bg-gold text-on-gold hover:bg-gold-hi',
                )}
              >
                {busy === organization.id ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : null}
                {isMentor ? 'Remove as mentor' : 'Make mentor'}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
