import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import {
  decideInvite,
  EVENTS_ADDRESS,
  type HeldInvite,
  useHeldInvites,
} from '@/lib/calendar-invites';
import { HAND_ADDED_TIMEZONE } from '@/lib/events';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { hostOptions } from '@/routes/events/event-draft';
import { longWhen } from '@/routes/events/format';

/**
 * Calendar invitations waiting for a decision (20261022220000), for the
 * organization's representatives and administrators. The emails about a
 * held invitation link here.
 *
 * Held because the email could not be verified as the representative's, or
 * because they speak for several organizations and named none. Approving
 * puts it on the calendar as the approver, under the club's own rules;
 * discarding keeps it off.
 */
export default function HeldInvitesPage() {
  const { invites, loading, error, reload } = useHeldInvites();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pt-4 pb-10">
        <Link to="/events" className="font-bold text-[0.875rem] text-emphasis">
          ← Events
        </Link>
        <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink">
          Calendar invitations
        </h1>
        <p className="mt-1 text-[0.84375rem] text-ink2 leading-[1.5]">
          Invite <b>{EVENTS_ADDRESS}</b> to an event in your calendar and it is added to the club.
          These are waiting for a decision.
        </p>

        {error ? (
          <p role="alert" className="mt-4 text-[0.875rem] text-destructive">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="py-8 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : invites.length === 0 && !error ? (
          <p className="mt-6 rounded-[14px] border border-line bg-paper p-4 text-center text-[0.875rem] text-ink2">
            Nothing is waiting.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {invites.map((invite) => (
              <li key={invite.id}>
                <HeldCard invite={invite} onDecided={() => void reload()} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HeldCard({ invite, onDecided }: { invite: HeldInvite; onDecided: () => void }) {
  const account = useAccount();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const { organizations } = useOrganizations();
  const mine = useMyOrganizations(account.userId);
  const choices = hostOptions(organizations, account.isAdmin, mine.ids);
  const [organization, setOrganization] = useState<string>(invite.organizationId ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const needsChoice = invite.organizationId === null && !account.isAdmin;

  async function decide(approve: boolean) {
    setBusy(true);
    setFailure(null);
    const result = await decideInvite(invite.id, approve, organization || null);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (approve && result.eventId) {
      announce('The event is on the calendar.');
      void navigate(`/events/${result.eventId}`);
      return;
    }
    announce('Discarded.');
    onDecided();
  }

  return (
    <article className="rounded-[14px] border border-line bg-paper p-3.5">
      <h2 className="font-extrabold font-head text-[1rem] text-ink">{invite.title}</h2>
      <p className="mt-0.5 text-[0.8125rem] text-ink2">
        {longWhen(invite.starts, HAND_ADDED_TIMEZONE)}
        {invite.location ? ` · ${invite.location}` : ''}
        {invite.repeats ? ' · repeats' : ''}
      </p>
      <p className="mt-1.5 text-[0.8125rem] text-ink2">
        From{' '}
        {invite.senderName ? `${invite.senderName} (${invite.senderEmail})` : invite.senderEmail}
        {invite.changesEvent ? ', changing an event already on the calendar' : ''}
      </p>
      {invite.reason ? (
        <p className="mt-1.5 rounded-[10px] bg-gold-lt px-3 py-2 text-[0.8125rem] text-ink leading-[1.45]">
          {invite.reason}
        </p>
      ) : null}

      {invite.organizationId === null ? (
        <label className="mt-3 block font-bold text-[0.8125rem] text-ink">
          Hosted by
          <select
            value={organization}
            onChange={(e) => {
              setOrganization(e.target.value);
            }}
            className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3 py-2.5 font-normal text-[0.9375rem] text-ink outline-none focus:border-emphasis"
          >
            <option value="">{account.isAdmin ? 'The SCI Club' : 'Choose the organization'}</option>
            {choices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-2 text-[0.8125rem] text-ink2">
          Hosted by <b className="text-ink">{invite.organizationName}</b>
        </p>
      )}

      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          disabled={busy || (needsChoice && !organization)}
          onClick={() => void decide(true)}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-gold font-bold font-head text-[0.875rem] text-on-gold disabled:opacity-40"
        >
          {invite.changesEvent ? 'Approve the change' : 'Add to the calendar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide(false)}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] border-[1.6px] border-line bg-paper font-bold font-head text-[0.875rem] text-ink2 disabled:opacity-40"
        >
          Discard
        </button>
      </div>
    </article>
  );
}
