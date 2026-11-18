import { type InviteGroup, inviteSteps, type TrackedInvite } from '@/lib/invite-tracking';

/**
 * How emailed invites did (the owner, 2026-11-14): the counts in a row and
 * each person's steps. Shared by the administrator's club invites
 * (routes/admin/invite-tracking-section.tsx) and an event's guest list
 * (routes/events/event-invite-tracking.tsx).
 */

function Step({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        on ? 'rounded-full bg-tint px-2 py-0.5 font-bold text-emphasis' : 'px-1 py-0.5 text-grey/75'
      }
    >
      {on ? null : <span className="sr-only">Not yet: </span>}
      {children}
    </span>
  );
}

/** The onboarding steps (onboarding_steps), as an administrator reads them. */
const STEP_NAMES: Record<string, string> = {
  agree: 'Rules',
  name: 'Name',
  username: 'Username',
  birthday: 'Birthday',
  injury: 'Injury',
  city: 'City',
  phone: 'Phone',
  photo: 'Photo',
};

export function InvitePerson({
  invite,
  isEvent,
  className = 'border-line border-t px-3 py-2.5',
}: {
  invite: TrackedInvite;
  isEvent: boolean;
  className?: string;
}) {
  const { opened, viewed, started, joined } = inviteSteps(invite);
  const step = !joined && invite.reachedStep ? STEP_NAMES[invite.reachedStep] : undefined;
  return (
    <li className={`${className} text-[0.8125rem] leading-[1.4]`}>
      <span className="block [overflow-wrap:anywhere]">
        {invite.name ? <span className="font-bold text-ink">{invite.name} · </span> : null}
        <span className="text-ink2">{invite.email}</span>
      </span>
      <span className="mt-1.5 flex flex-wrap gap-1 text-[0.75rem]">
        {invite.sentAt === null ? (
          <span className="px-1 py-0.5 font-bold text-danger-ink">Email not sent</span>
        ) : null}
        <Step on={opened}>Opened</Step>
        <Step on={viewed}>{isEvent ? 'Viewed the event' : 'Clicked the link'}</Step>
        {isEvent && invite.rsvp === 'no' ? (
          <span className="px-1 py-0.5 font-bold text-ink2">Can’t go</span>
        ) : isEvent ? (
          <Step on={invite.rsvp !== null}>
            {invite.rsvp === 'interested' ? 'Interested' : 'Going'}
          </Step>
        ) : null}
        <Step on={started}>{step ? `Stopped at ${step}` : 'Started'}</Step>
        {/* "Stopped at" already says they have not joined; one line, not two. */}
        {step ? null : (
          <Step on={joined}>
            {joined && invite.memberName && invite.memberName !== invite.name
              ? `Joined as ${invite.memberName}`
              : 'Joined'}
          </Step>
        )}
      </span>
    </li>
  );
}

function Count({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center">
      <span className="font-extrabold font-head text-[1rem] text-ink tabular-nums">{n}</span>
      <span className="text-[0.6875rem] text-grey">{label}</span>
      {of > 0 && label !== 'sent' ? (
        <span className="text-[0.6875rem] text-grey tabular-nums">
          {Math.round((n / of) * 100)}%
        </span>
      ) : null}
    </span>
  );
}

export function InviteFunnel({
  counts: c,
  isEvent,
  className = '',
}: {
  counts: InviteGroup['counts'];
  isEvent: boolean;
  className?: string;
}) {
  const viewed = isEvent ? 'viewed' : 'clicked';
  return (
    <>
      <span className="sr-only">
        {`${String(c.sent)} sent, ${String(c.opened)} opened, ${String(c.viewed)} ${viewed}, ${String(c.started)} started joining${isEvent ? `, ${String(c.going)} going` : ''}, ${String(c.joined)} joined`}
      </span>
      <span
        aria-hidden="true"
        className={`grid gap-1 ${isEvent ? 'grid-cols-6' : 'grid-cols-5'} ${className}`}
      >
        <Count n={c.sent} of={c.sent} label="sent" />
        <Count n={c.opened} of={c.sent} label="opened" />
        <Count n={c.viewed} of={c.sent} label={viewed} />
        <Count n={c.started} of={c.sent} label="started" />
        {isEvent ? <Count n={c.going} of={c.sent} label="going" /> : null}
        <Count n={c.joined} of={c.sent} label="joined" />
      </span>
    </>
  );
}
