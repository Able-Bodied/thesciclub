import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { QrCode } from '@/components/qr-code';
import { useAccount } from '@/lib/account';
import { loadSignInDetails } from '@/lib/account-email';
import { useAnnounce } from '@/lib/announce';
import { looksLikeEmail } from '@/lib/auth-email';
import { useDialogFocus } from '@/lib/dialog-focus';
import { fetchJoiningIsOpen } from '@/lib/joining';
import {
  createQrCode,
  fetchMyQrCodes,
  type MyQrCode,
  qrJoinUrl,
  turnOffQrCode,
} from '@/lib/qr-codes';
import { shareLink } from '@/lib/share-link';
import { cn } from '@/lib/utils';

/**
 * An administrator's QR code, for conventions (20261014020000). The owner,
 * 2026-10-14: each administrator names the event they are at (or none),
 * checks the email shown while joining is closed (their account's, unless
 * they type another), and shows the code. Whoever joins from it while anybody
 * can join is recorded as invited by them; while joining is closed it lets
 * nobody in, and says so here before it is shown.
 *
 * Every code made is listed below, with a way to turn it off: an old code
 * keeps showing its email whenever joining is closed until it is.
 */

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', SHORT_DATE);

const FIELD =
  'mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis';

export default function QrCodePage() {
  const account = useAccount();
  const announce = useAnnounce();
  const [atEvent, setAtEvent] = useState(true);
  const [eventName, setEventName] = useState('');
  const [email, setEmail] = useState('');
  const emailTouched = useRef(false);
  const [joiningOpen, setJoiningOpen] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<MyQrCode[] | null>(null);
  const [showing, setShowing] = useState<MyQrCode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = account.status === 'member' && account.isAdmin;

  const load = useCallback(async () => {
    const result = await fetchMyQrCodes();
    if (result.ok) setCodes(result.codes);
    else setError(result.error);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    void fetchJoiningIsOpen().then(setJoiningOpen);
    // The account's address, into an empty box only.
    void loadSignInDetails().then((result) => {
      if (result.ok && result.details.email && !emailTouched.current) {
        setEmail(result.details.email);
      }
    });
  }, [isAdmin, load]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  if (!account.isAdmin) return <Navigate to="/me" replace />;

  const event = atEvent ? eventName.trim() : '';
  const ready = (!atEvent || event !== '') && looksLikeEmail(email);

  async function make() {
    if (!ready || busy) return;
    setBusy('new');
    setError(null);
    const result = await createQrCode(atEvent ? event : null, email.trim());
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowing(result.code);
    void load();
  }

  async function turnOff(code: MyQrCode) {
    const name = code.eventName ?? 'your code with no event';
    if (
      !window.confirm(
        `Turn off ${name}?\n\nScanning it will no longer say who invited them or show your email. People who already joined from it keep their credit.`,
      )
    ) {
      return;
    }
    setBusy(code.id);
    setError(null);
    const result = await turnOffQrCode(code.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce(`${code.eventName ?? 'The code with no event'} is turned off.`);
    void load();
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[560px]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Your QR code
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
            While anybody can join, people who join from your code are recorded as invited by you,
            and you are told when they do.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] flex-none px-4 pt-4 pb-8">
        {joiningOpen === false ? (
          <div
            role="status"
            className="mb-4 rounded-[14px] border border-gold-dp bg-gold-lt p-3.5 text-[0.875rem] text-ink leading-[1.5]"
          >
            <p className="font-bold">Joining is invite only right now.</p>
            <p className="mt-1">
              This code won't let anyone in. They'll see your email so they can ask you for an
              invite.
            </p>
            <Link
              to="/admin?tab=invites"
              className="mt-2 inline-flex min-h-[44px] items-center font-bold text-emphasis underline"
            >
              Let anybody join, in Admin
            </Link>
          </div>
        ) : null}

        <form
          className="rounded-[14px] border border-line bg-paper p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void make();
          }}
        >
          <fieldset>
            <legend className="font-bold text-[0.875rem] text-ink">Where will you show it?</legend>
            <div className="mt-1.5 flex flex-col gap-1">
              <label className="flex min-h-[44px] items-center gap-2.5 text-[0.9375rem] text-ink">
                <input
                  type="radio"
                  name="qr-event"
                  checked={atEvent}
                  onChange={() => {
                    setAtEvent(true);
                  }}
                  className="h-5 w-5 accent-[var(--color-action)]"
                />
                At an event
              </label>
              <label className="flex min-h-[44px] items-center gap-2.5 text-[0.9375rem] text-ink">
                <input
                  type="radio"
                  name="qr-event"
                  checked={!atEvent}
                  onChange={() => {
                    setAtEvent(false);
                  }}
                  className="h-5 w-5 accent-[var(--color-action)]"
                />
                No event
              </label>
            </div>
          </fieldset>

          {atEvent ? (
            <div className="mt-2">
              <label htmlFor="qr-event-name" className="block font-bold text-[0.8125rem] text-ink">
                Event name
              </label>
              <input
                id="qr-event-name"
                value={eventName}
                maxLength={80}
                placeholder="Abilities Expo LA"
                onChange={(e) => {
                  setEventName(e.target.value);
                }}
                className={FIELD}
              />
              <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
                Admin counts who joined by this name, so type it the same way each time.
              </p>
            </div>
          ) : null}

          <div className="mt-3.5">
            <label htmlFor="qr-email" className="block font-bold text-[0.8125rem] text-ink">
              Email shown while joining is closed
            </label>
            <input
              id="qr-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                emailTouched.current = true;
                setEmail(e.target.value);
              }}
              className={FIELD}
            />
            <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
              Anybody who scans the code while the club is invite only sees it, so they can ask you
              for an invite. Your account's address unless you change it.
            </p>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!ready || busy !== null}
            className="mt-3.5 flex min-h-[48px] w-full items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.9375rem] text-white disabled:opacity-40"
          >
            {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Make the QR code'}
          </button>
        </form>

        <h2 className="mt-6 mb-2 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          Your codes
        </h2>
        {codes === null ? (
          <p className="py-6 text-center text-[0.875rem] text-grey">Loading your codes…</p>
        ) : codes.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-paper px-3.5 py-6 text-center text-[0.875rem] text-grey">
            You have not made a code yet.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
            {codes.map((code) => (
              <li
                key={code.id}
                className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 basis-[13rem]">
                  <span
                    className={cn(
                      'block break-words font-extrabold font-head text-[0.90625rem]',
                      code.turnedOffAt ? 'text-grey' : 'text-ink',
                    )}
                  >
                    {code.eventName ?? 'No event'}
                  </span>
                  <span className="mt-0.5 block break-words text-[0.75rem] text-grey leading-[1.45]">
                    Made {shortDate(code.createdAt)} ·{' '}
                    {code.turnedOffAt
                      ? `turned off ${shortDate(code.turnedOffAt)}`
                      : `shows ${code.contactEmail} while closed`}
                  </span>
                </span>
                {code.turnedOffAt ? null : busy === code.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-grey" />
                ) : (
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setShowing(code);
                      }}
                      className="min-h-[44px] rounded-[10px] bg-tint px-3 font-semibold text-[0.8125rem] text-emphasis disabled:opacity-40"
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void turnOff(code);
                      }}
                      className="min-h-[44px] rounded-[10px] bg-destructive/10 px-3 font-semibold text-[0.8125rem] text-destructive disabled:opacity-40"
                    >
                      Turn off
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showing ? (
        <ShowingCode
          code={showing}
          inviterName={account.displayName}
          joiningOpen={joiningOpen}
          onClose={() => {
            setShowing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The code, as large as the screen allows, over everything including the tab
 * bar: it is held up across a table. White whatever the theme, for the camera.
 */
function ShowingCode({
  code,
  inviterName,
  joiningOpen,
  onClose,
}: {
  code: MyQrCode;
  inviterName: string | null;
  joiningOpen: boolean | null;
  onClose: () => void;
}) {
  const announce = useAnnounce();
  const dialog = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useDialogFocus(dialog, title, onClose);
  const url = qrJoinUrl(code.code);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function share() {
    const outcome = await shareLink({
      url,
      title: 'The SCI Club',
      text: inviterName
        ? `${inviterName} invited you to The SCI Club.`
        : 'You are invited to The SCI Club.',
    });
    if (outcome === 'copied') {
      setShareNote('Link copied.');
      announce('Link copied.');
    } else if (outcome === 'failed') {
      setShareNote(`Could not share it. The link is ${url}`);
    }
  }

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-showing-title"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white text-[#111111]"
    >
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="flex w-full justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the code"
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full text-[#111111]"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <h2
          id="qr-showing-title"
          ref={title}
          tabIndex={-1}
          className="text-center font-extrabold font-display text-[1.5rem] leading-tight outline-none"
        >
          {code.eventName ?? 'The SCI Club'}
        </h2>
        <p className="mt-1 text-center text-[1rem]">
          Scan to join The SCI Club{inviterName ? ` · invited by ${inviterName}` : ''}
        </p>
        <div className="mt-4 w-full max-w-[min(100%,62dvh)]">
          <QrCode text={url} label="QR code that opens the club's join page" />
        </div>
        {joiningOpen === false ? (
          <p className="mt-3 text-center font-bold text-[0.9375rem] text-[#7a4b00]">
            Joining is invite only right now: this code lets nobody in.
          </p>
        ) : null}
        <div className="mt-auto flex w-full flex-col gap-2 pt-5">
          <button
            type="button"
            onClick={() => {
              void share();
            }}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-[#111111] font-bold font-head text-[0.9375rem] text-white"
          >
            Share the link
          </button>
          {shareNote ? (
            <p role="status" className="break-all text-center text-[0.875rem]">
              {shareNote}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-[#111111] font-bold font-head text-[0.9375rem]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
