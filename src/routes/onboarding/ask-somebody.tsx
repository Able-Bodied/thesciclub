import { CalendarDays, MessageCircle, Users } from 'lucide-react';
import { useState } from 'react';
import { describeThrown } from '@/lib/describe-error';
import {
  CONSULTATION_URL,
  canPickContacts,
  findInviters,
  inviteRequestText,
  normalizedDigits,
  pickContacts,
  smsHref,
} from '@/lib/invite-request';
import { formatPhoneInput, isCompletePhone } from '@/lib/phone';

/**
 * On the closed door: find somebody you already know who can add you, and
 * text them; or, knowing nobody, book a call (the owner, 2026-10-10).
 *
 * What the person learns is only that a number they already have belongs to
 * somebody who can add them (find_inviters, 20261011000000). The name shown is
 * the one from their own contacts, or the number they typed: nothing from the
 * club. The text goes from their own phone.
 */
interface Match {
  label: string;
  phone: string;
}

export function AskSomebody({ ownPhone }: { ownPhone: string }) {
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contactsOffered = canPickContacts();
  const message = inviteRequestText(ownPhone);

  async function check(candidates: Match[]) {
    if (candidates.length === 0) return;
    setChecking(true);
    setError(null);
    try {
      const result = await findInviters(candidates.slice(0, 100).map((c) => c.phone));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const found = new Set(result.phones.map(normalizedDigits));
      const seen = new Set<string>();
      setMatches(
        candidates.filter((c) => {
          const digits = normalizedDigits(c.phone);
          if (!found.has(digits) || seen.has(digits)) return false;
          seen.add(digits);
          return true;
        }),
      );
    } catch (e) {
      setError(describeThrown(e, 'Could not check those numbers.'));
    } finally {
      setChecking(false);
    }
  }

  async function fromContacts() {
    try {
      const contacts = await pickContacts();
      await check(
        contacts.flatMap((contact) =>
          contact.numbers.map((phone) => ({ label: contact.name, phone })),
        ),
      );
    } catch {
      // Closing the picker without choosing is not an error.
    }
  }

  return (
    <section aria-labelledby="ask-somebody-heading" className="mt-5">
      <h2
        id="ask-somebody-heading"
        className="font-extrabold font-head text-[1.0625rem] text-ink tracking-[-0.01em]"
      >
        Know somebody in the club?
      </h2>
      <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
        A mentor or an administrator you know can add your number. Check whether somebody you know
        can, and text them to ask.
      </p>

      <div className="mt-3 rounded-[17px] border border-line bg-paper p-3.5">
        {contactsOffered ? (
          <>
            <button
              type="button"
              disabled={checking}
              onClick={() => {
                void fromContacts();
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-action px-4 font-bold font-head text-[0.9375rem] text-white disabled:opacity-50"
            >
              <Users aria-hidden="true" className="h-[1.1em] w-[1.1em]" />
              Choose from your contacts
            </button>
            <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
              Only the people you choose are checked, and none of them are kept.
            </p>
          </>
        ) : null}

        <form
          className={contactsOffered ? 'mt-3.5' : ''}
          onSubmit={(event) => {
            event.preventDefault();
            if (isCompletePhone(typed)) void check([{ label: typed, phone: typed }]);
          }}
        >
          <label
            htmlFor="ask-number"
            className="block font-bold font-head text-[0.8125rem] text-ink"
          >
            {contactsOffered
              ? 'Or type the number of somebody you know'
              : 'The number of somebody you know'}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="ask-number"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(formatPhoneInput(event.target.value));
              }}
              placeholder="(408) 555-0112"
              className="min-h-[48px] min-w-0 flex-1 rounded-[12px] border-[1.6px] border-line bg-canvas px-3.5 text-[1rem] text-ink outline-none focus:border-emphasis"
            />
            <button
              type="submit"
              disabled={checking || !isCompletePhone(typed)}
              className="min-h-[48px] flex-none rounded-[12px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-40"
            >
              {checking ? 'Checking…' : 'Check'}
            </button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}

        <div aria-live="polite">
          {matches === null ? null : matches.length === 0 ? (
            <p className="mt-3 text-[0.875rem] text-ink2 leading-[1.5]">
              None of them can add you. You could ask one of the organizations above, or book a call
              below.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {matches.map((match) => (
                <li
                  key={match.phone}
                  className="flex flex-wrap items-center gap-2.5 rounded-[13px] bg-tint px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-[0.875rem] text-ink">
                    <span className="font-bold">{match.label}</span> can add you.
                  </span>
                  <a
                    href={smsHref(match.phone, message)}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-gold px-4 font-bold font-head text-[0.875rem] text-on-gold"
                  >
                    <MessageCircle aria-hidden="true" className="h-4 w-4" />
                    Text {match.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[17px] border border-line bg-paper p-3.5">
        <p className="font-extrabold font-head text-[0.9375rem] text-ink">
          Don't know anybody yet?
        </p>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
          Book a free one-to-one video call with Wojtek, who can tell you about the club and help
          you get in.
        </p>
        <a
          href={CONSULTATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          <CalendarDays aria-hidden="true" className="h-[1.1em] w-[1.1em]" />
          Book a call with Wojtek
        </a>
      </div>
    </section>
  );
}
