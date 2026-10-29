import { useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { grantMentor, revokeMentor } from '@/lib/organization-mentors';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import type { RepresentedOrganization } from '@/types/domain';

export interface MentorAction {
  organization: RepresentedOrganization;
  isMentor: boolean;
}

/**
 * On a member's profile, for the admins of an organization (the owner,
 * 2026-10-28): make them a mentor of that organization, or stop. One action
 * for each organization the viewer is an org admin of, in the profile's •••
 * (the owner asked for it out of the page); none for anybody else, or on
 * their own profile. The database decides again (grant_mentor).
 */
export function useMentorActions({
  memberId,
  displayName,
  mentorOf,
  onChange,
}: {
  memberId: string | null;
  displayName: string;
  mentorOf: RepresentedOrganization[];
  onChange: (next: RepresentedOrganization[]) => void;
}): {
  actions: MentorAction[];
  run: (action: MentorAction) => void;
  error: string | null;
} {
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;
  const mine = useMyOrganizations(viewerId);
  const { byId } = useOrganizations();
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);

  const actions: MentorAction[] =
    !viewerId || !memberId || viewerId === memberId
      ? []
      : [...mine.ids]
          .map((id) => byId.get(id))
          .filter((organization) => organization !== undefined)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((organization) => ({
            organization,
            isMentor: mentorOf.some((o) => o.id === organization.id),
          }));

  function run({ organization, isMentor }: MentorAction) {
    if (!memberId) return;
    setError(null);
    void (isMentor ? revokeMentor : grantMentor)(organization.id, memberId).then((result) => {
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

  return { actions, run, error };
}

/** Each action as a line in the profile's •••. */
export function mentorActionLabel({ organization, isMentor }: MentorAction): string {
  return isMentor
    ? `Remove as mentor for ${organization.name}`
    : `Make mentor for ${organization.name}`;
}
