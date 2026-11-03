import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { useDialogFocus } from '@/lib/dialog-focus';
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

/**
 * For an org admin of more than one organization: one line in the •••, then
 * this, so the menu stays short (the owner, 2026-11-03). Each box makes or
 * stops a mentor of that organization as it is ticked.
 */
export function MentorSheet({
  displayName,
  actions,
  run,
  error,
  onClose,
}: {
  displayName: string;
  actions: MentorAction[];
  run: (action: MentorAction) => void;
  error: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onClose);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close mentor choices"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper p-5 text-ink shadow-xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[360px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="font-bold font-head text-lg outline-none"
        >
          {displayName} is a mentor for
        </h2>
        <ul className="mt-2">
          {actions.map((action) => (
            <li key={action.organization.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm hover:bg-tint">
                <input
                  type="checkbox"
                  checked={action.isMentor}
                  onChange={() => {
                    run(action);
                  }}
                  className="h-5 w-5 flex-none accent-[var(--color-action)]"
                />
                <span className="min-w-0 break-words">{action.organization.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-12 w-full rounded-xl border border-line font-semibold"
        >
          Done
        </button>
      </div>
    </>,
    document.body,
  );
}
