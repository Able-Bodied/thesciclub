import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import {
  fetchPublicEvent,
  keepPendingRegistration,
  type PublicEvent,
  registerForEvent,
} from '@/lib/event-audience';
import { HAND_ADDED_TIMEZONE } from '@/lib/events';
import { formatPhoneInput } from '@/lib/phone';
import { shortDate, timeOfDay } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { safeHref } from '@/routes/events/rich-text';
import type { RsvpStatus } from '@/types/domain';

/**
 * Registering for a public event, with or without an account (the owner,
 * 2026-10-22; register_for_event, 20261022190000).
 *
 * The same short form for anybody: kept for the event's organizers as soon as
 * it is sent. Then the welcome page, the same whoever they are, so it never
 * says whether an address is a member's. A registration is not an invite
 * (20261022230000). A copy stays on this device so the app can open the
 * event once a member signs in.
 */

const FIELD =
  'mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none focus:border-emphasis';
const LABEL = 'mt-4 block font-bold text-[0.8125rem] text-ink';

export default function RegisterForEventPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const account = useAccount();
  const navigate = useNavigate();
  const [event, setEvent] = useState<PublicEvent | null | undefined>(undefined);
  const [status, setStatus] = useState<RsvpStatus>(
    params.get('status') === 'interested' ? 'interested' : 'going',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicEvent(id).then((result) => {
      if (!cancelled) setEvent(result.ok ? result.value : null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (account.status === 'member') return <Navigate to={`/events/${id}`} replace />;

  const ready = name.trim() !== '' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit() {
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    const registration = { eventId: id, status, name, email, phone };
    const result = await registerForEvent(registration);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    keepPendingRegistration({
      ...registration,
      email: email.trim(),
      name: name.trim(),
      ...(event?.organization ? { organizer: event.organization.name } : {}),
    });
    void navigate('/join', { replace: true });
  }

  const timezone = event?.timezone ?? HAND_ADDED_TIMEZONE;
  const signUp = safeHref(event?.registrationUrl ?? null);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] bg-canvas px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Link to={`/e/${id}`} className="inline-block py-2 font-bold text-[0.875rem] text-emphasis">
        ← Back to the event
      </Link>
      <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink leading-tight">
        Get added to the guest list
      </h1>

      {event === null ? (
        <p role="alert" className="mt-4 text-[0.875rem] text-ink2">
          This event's page is not public.
        </p>
      ) : null}

      {event ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-line bg-paper p-3">
            {event.organization ? <OrganizationBadge organization={event.organization} /> : null}
            <span className="min-w-0">
              <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                {event.title}
              </span>
              <span className="block text-[0.8125rem] text-ink2">
                {shortDate(event.startTime, timezone)}
                {event.allDay ? '' : ` · ${timeOfDay(event.startTime, timezone)}`}
                {event.city ? ` · ${event.city}` : ''}
              </span>
            </span>
          </div>

          <fieldset className="mt-4">
            <legend className="sr-only">Your answer</legend>
            <div className="flex gap-2">
              {(['going', 'interested'] as const).map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-full border-[1.4px] px-4 py-2 font-bold font-head text-[0.875rem] ${
                    status === value
                      ? 'border-emphasis bg-emphasis text-white'
                      : 'border-line bg-paper text-ink2'
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={value}
                    checked={status === value}
                    onChange={() => {
                      setStatus(value);
                    }}
                    className="sr-only"
                  />
                  {value === 'going' ? 'Going' : 'Interested'}
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="register-name" className={LABEL}>
            Your name
          </label>
          <input
            id="register-name"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className={FIELD}
          />
          <label htmlFor="register-email" className={LABEL}>
            Email
          </label>
          <input
            id="register-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            className={FIELD}
          />
          <label htmlFor="register-phone" className={LABEL}>
            Phone (optional)
          </label>
          <input
            id="register-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={32}
            placeholder="(408) 555-0112"
            value={phone}
            onChange={(e) => {
              setPhone(formatPhoneInput(e.target.value));
            }}
            className={FIELD}
          />
          <p className="mt-2 text-[0.78125rem] text-grey leading-[1.45]">
            The event's organizer and the club's administrators see these, for this event only. They
            are deleted 90 days after it.
          </p>
          {/* Not a sign-up with the host (the owner, 2026-10-24): filling this
              in does not register anybody on the organization's own site. */}
          <p className="mt-3 rounded-[11px] bg-tint px-3 py-2.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            This tells {event.organization?.name ?? 'the organizer'}{' '}
            {status === 'going' ? "you're coming" : "you're interested"}. It doesn't sign you up on
            their site
            {signUp ? (
              <>
                {'; for that, use '}
                <a
                  href={signUp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-emphasis underline"
                >
                  their sign-up
                </a>
                .
              </>
            ) : (
              '.'
            )}
          </p>

          {error ? (
            <p role="alert" className="mt-3 text-[0.8125rem] text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!ready || sending}
            className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Submit'}
          </button>
        </form>
      ) : null}
    </main>
  );
}
