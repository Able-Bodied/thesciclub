import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { OpenInAppButton } from '@/components/open-in-app';
import { appCouldOpen } from '@/lib/app-handoff';
import {
  answerEventInvite,
  type EventInvite,
  fetchInviteAnswer,
  type InviteAnswer,
} from '@/lib/event-invite';
import { cn } from '@/lib/utils';

/**
 * The top of an event's page opened from an invite email (20261114020000):
 * who asked, and Going, Maybe or Can't go (20261114070000). The email has the
 * same three buttons; the one pressed there arrives as `linkAnswer` and is
 * saved as the page opens, so one tap in the email is the whole answer.
 *
 * Going or Maybe then offers the club: joining starts onboarding from this
 * invite (invite_details_for_token reads the registration the answer made).
 * Without a name on the invite, a box asks for one for the host's list.
 */

const ANSWERS: { value: InviteAnswer; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'interested', label: 'Maybe' },
  { value: 'no', label: 'Can’t go' },
];

const SAVED: Record<InviteAnswer, string> = {
  going: 'You’re going. Saved.',
  interested: 'You might go. Saved.',
  no: 'You can’t go. Saved.',
};

export function InviteAccept({
  token,
  invite,
  linkAnswer = null,
  onLinkAnswered,
}: {
  token: string;
  invite: EventInvite;
  /** The answer pressed in the email, to save now. */
  linkAnswer?: InviteAnswer | null;
  /** Called once it is used, so a reload does not answer again. */
  onLinkAnswered?: () => void;
}) {
  // Undefined while read.
  const [answer, setAnswer] = useState<InviteAnswer | null | undefined>(undefined);
  const [saving, setSaving] = useState<InviteAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const started = useRef(false);
  const inviter = invite.inviterName;
  // On an iPhone, this page in the club's app (app-handoff.ts): the invite
  // comes along, so joining there starts from it. Without the answer the
  // email's button left, already saved here.
  const [onIphone] = useState(() => appCouldOpen());
  const { pathname, search } = useLocation();
  const inApp = new URLSearchParams(search);
  inApp.delete('rsvp');
  const appPath = `${pathname}${inApp.size > 0 ? `?${inApp.toString()}` : ''}`;

  async function choose(next: InviteAnswer, typedName?: string) {
    setSaving(next);
    setError(null);
    const result = await answerEventInvite(token, next, typedName);
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setAnswer(next);
    return true;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the page opens.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (linkAnswer) {
      void choose(linkAnswer).then(() => onLinkAnswered?.());
      return;
    }
    void fetchInviteAnswer(token).then(setAnswer);
  }, []);

  const coming = answer === 'going' || answer === 'interested';
  const status = saving
    ? 'Saving your answer…'
    : answer
      ? SAVED[answer]
      : answer === null
        ? `Are you coming? ${inviter ?? 'The host'} will see your answer.`
        : '';

  return (
    <section
      aria-label="Your invite"
      className="mt-4 rounded-[16px] border-[1.6px] border-gold bg-paper px-4 pt-4 pb-4"
    >
      <p className="font-extrabold font-head text-[1.0625rem] text-ink leading-[1.35]">
        {inviter ? `${inviter} invited you` : 'You’re invited'}
      </p>
      <p role="status" className="mt-1 min-h-[1.3em] text-[0.875rem] text-ink2 leading-[1.45]">
        {status}
      </p>

      <fieldset className="mt-3 grid grid-cols-3 gap-2">
        <legend className="sr-only">Your answer</legend>
        {ANSWERS.map((choice) => {
          const chosen = answer === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={chosen}
              disabled={saving !== null}
              onClick={() => {
                if (!chosen) void choose(choice.value);
              }}
              className={cn(
                'flex min-h-[48px] items-center justify-center rounded-[13px] px-2 font-bold font-head text-[0.9375rem] disabled:opacity-60',
                chosen
                  ? 'bg-gold text-on-gold'
                  : 'border-[1.6px] border-emphasis bg-paper text-emphasis',
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </fieldset>

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}

      {coming && !invite.guest.name && !nameSaved ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void choose(answer, name).then((ok) => {
              if (ok) setNameSaved(true);
            });
          }}
        >
          <label htmlFor="invite-name" className="block font-bold text-[0.8125rem] text-ink">
            Your name, for the host’s guest list
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="invite-name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="min-w-0 flex-1 rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2.5 text-[1rem] text-ink outline-none focus:border-emphasis"
            />
            <button
              type="submit"
              disabled={saving !== null || !name.trim()}
              className="rounded-[11px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}

      {coming ? (
        <div className="mt-4 rounded-[14px] bg-plate px-4 pt-4 pb-4 text-white">
          <p className="font-extrabold font-head text-[1rem] leading-[1.35]">
            Join The SCI Club to see who else is going and talk with them before the day.
          </p>
          <p className="mt-1 text-[#B9CADF] text-[0.8125rem] leading-[1.45]">
            It takes a couple of minutes, and your answer comes with you.
          </p>
          <Link
            to={`/join?invite=${encodeURIComponent(token)}`}
            className="mt-3 flex min-h-[48px] items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold"
          >
            Join the club
          </Link>
        </div>
      ) : answer === 'no' ? (
        <p className="mt-3 text-[0.875rem] text-ink2 leading-[1.45]">
          {`Thanks for letting ${inviter ?? 'the host'} know. If that changes, choose Going or Maybe.`}
        </p>
      ) : null}

      {onIphone ? (
        <OpenInAppButton
          path={appPath}
          signedIn={false}
          className="mt-3 flex min-h-11 w-full items-center justify-center font-bold text-[0.875rem] text-emphasis underline underline-offset-2"
        >
          Open this in the club’s iPhone app
        </OpenInAppButton>
      ) : null}
    </section>
  );
}
