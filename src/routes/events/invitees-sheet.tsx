import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useDialogFocus } from '@/lib/dialog-focus';
import type { EventVisibility } from '@/lib/event-audience';
import { cn } from '@/lib/utils';

const SUBHEADING =
  'mt-4 mb-2 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';

/**
 * Who is invited to an invite-only event, and who added or changed it (the owner,
 * 2026-11-07): for its organizers and its guests alike (20261107130000).
 * A guest is shown only the members the directory shows them.
 */
export function InviteesSheet({
  visibility,
  organizationName,
  readerId,
  onClose,
}: {
  visibility: EventVisibility;
  organizationName: string | null;
  readerId: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onClose);
  const invitees = visibility.invitees ?? [];
  const unseen = visibility.inviteeCount - invitees.length;
  const row = 'flex min-h-[48px] items-center gap-3 rounded-[12px] px-1.5 py-1.5 hover:bg-tint';
  const you = (id: string, name: string) => (id === readerId ? `${name} (you)` : name);
  // Whoever added it, then whoever changed it or invited people (20261107140000).
  const organizers = [
    ...(visibility.addedBy ? [{ person: visibility.addedBy, did: 'Added it' }] : []),
    ...visibility.changedBy
      .filter((person) => person.id !== visibility.addedBy?.id)
      .map((person) => ({ person, did: 'Changed it' })),
  ];

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close the list"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-[81] flex flex-col bg-paper text-ink',
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82dvh] lg:w-[520px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
        )}
      >
        <div className="flex-1 overflow-y-auto px-[18px] pt-5 pb-2">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            Who’s invited
          </h2>

          <h3 className={SUBHEADING}>Organized by</h3>
          {organizers.length > 0 ? (
            <ul className="flex flex-col">
              {organizers.map(({ person, did }) => (
                <li key={person.id}>
                  <Link to={`/peers/${person.id}`} className={row}>
                    <MemberAvatar
                      id={person.id}
                      displayName={person.displayName}
                      photoPath={person.photoPath}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-[0.9375rem]">
                        {you(person.id, person.displayName)}
                      </span>
                      <span className="block text-[0.78125rem] text-grey">{did}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
            {organizationName ? `${organizationName}’s org admins` : 'Its organizers'} and the
            club’s administrators can see it too.
          </p>

          <h3 className={SUBHEADING}>Invited ({visibility.inviteeCount})</h3>
          {invitees.length === 0 ? (
            <p className="text-[0.875rem] text-ink2">Nobody yet.</p>
          ) : (
            <ul className="flex flex-col">
              {invitees.map((member) => (
                <li key={member.id}>
                  <Link to={`/peers/${member.id}`} className={row}>
                    <MemberAvatar
                      id={member.id}
                      displayName={member.displayName}
                      photoPath={member.photoPath}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-[0.9375rem]">
                        {you(member.id, member.displayName)}
                      </span>
                      {member.username ? (
                        <span className="block text-[0.78125rem] text-grey">
                          @{member.username}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {unseen > 0 ? (
            <p className="mt-1.5 text-[0.8125rem] text-grey">
              {unseen === 1 ? '1 more is' : `${unseen} more are`} not shown to you.
            </p>
          ) : null}
        </div>
        <div className="flex flex-none border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Done
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
