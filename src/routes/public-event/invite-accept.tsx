import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptEventInvite, type EventInvite } from '@/lib/event-invite';

/**
 * The top of an event's page opened from an invite email (20261114020000):
 * who asked, their name and address already filled in, and one button that
 * accepts and goes on to join the club. Onboarding then starts from what is
 * here (invite_details_for_token reads the registration this makes).
 *
 * The address is the one the invite went to and is not edited here: it is
 * how the club knows the invite is theirs. Name and phone can change.
 */
export function InviteAccept({ token, invite }: { token: string; invite: EventInvite }) {
  const navigate = useNavigate();
  const [name, setName] = useState(invite.guest.name);
  const [phone, setPhone] = useState(invite.guest.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!name.trim()) {
      setError('Add your name.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await acceptEventInvite(token, name.trim(), phone.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void navigate(`/join?invite=${encodeURIComponent(token)}`);
  }

  const field =
    'mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2.5 text-[1rem] text-ink outline-none focus:border-emphasis';

  return (
    <section
      aria-label="Your invite"
      className="mt-4 rounded-[16px] border-[1.6px] border-gold bg-paper px-4 pt-4 pb-4"
    >
      <p className="font-extrabold font-head text-[1.0625rem] text-ink leading-[1.35]">
        {invite.inviterName ? `${invite.inviterName} invited you` : 'You’re invited'}
      </p>
      <p className="mt-1 text-[0.875rem] text-ink2 leading-[1.45]">
        Accept to say you’re coming, and join The SCI Club to see who else is and talk with them
        before the day. It takes a couple of minutes.
      </p>

      <label htmlFor="invite-name" className="mt-3 block font-bold text-[0.8125rem] text-ink">
        Your name
      </label>
      <input
        id="invite-name"
        autoComplete="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className={field}
      />

      <p className="mt-3 font-bold text-[0.8125rem] text-ink">Email</p>
      <p className="mt-1 text-[0.9375rem] text-ink [overflow-wrap:anywhere]">
        {invite.guest.email}
      </p>

      <label htmlFor="invite-phone" className="mt-3 block font-bold text-[0.8125rem] text-ink">
        Phone (optional)
      </label>
      <input
        id="invite-phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
        }}
        className={field}
      />

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void accept();
        }}
        className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[13px] bg-gold px-3 text-center font-bold font-head text-[1rem] text-on-gold disabled:opacity-50"
      >
        {busy ? 'One moment…' : 'Accept invite and join the club'}
      </button>
    </section>
  );
}
