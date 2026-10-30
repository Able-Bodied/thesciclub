import { Loader2, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { QrCode } from '@/components/qr-code';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { PARTNER_ROLE_NAME, useIAmPartner } from '@/lib/club-partners';
import {
  CARD_BODY_MAX,
  CARD_HEADING_MAX,
  DEFAULT_CARD_BODY,
  DEFAULT_CARD_HEADING,
  fetchMyPartnerCard,
  saveMyPartnerCard,
} from '@/lib/partner-hub';
import { createQrCode, qrJoinUrl } from '@/lib/qr-codes';
import { cn } from '@/lib/utils';

/**
 * A trusted partner's printable card (20261029100000): their name, title, a
 * heading and words of their own, and their own QR code. The code has no
 * expiry and lets people in; asking again gives back the same live one.
 * Dark on white whatever the theme, for the camera and the printer.
 */

type CardSize = 'half-letter' | 'business';
const SIZES = [
  ['half-letter', 'Half letter'],
  ['business', 'Business cards'],
] as const satisfies readonly (readonly [CardSize, string])[];

/** Business cards print eight to a letter page. */
const BUSINESS_SHEET = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

const FIELD =
  'mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis';

export default function PartnerCardPage() {
  const account = useAccount();
  const announce = useAnnounce();
  const memberId = account.status === 'member' ? account.userId : null;
  const partner = useIAmPartner(memberId);
  const [title, setTitle] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [size, setSize] = useState<CardSize>('half-letter');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (partner !== true) return;
    void fetchMyPartnerCard().then((result) => {
      if (result.ok && result.value) {
        setTitle(result.value.title);
        setHeading(result.value.heading ?? '');
        setBody(result.value.body ?? '');
      } else if (!result.ok) {
        setError(result.error);
      }
      setLoaded(true);
    });
    void createQrCode({
      organizationId: null,
      eventName: null,
      contactEmail: null,
      expiresAt: null,
      notes: 'Printed card',
    }).then((result) => {
      if (result.ok) setCode(result.code.code);
      else setCodeError(result.error);
    });
  }, [partner]);

  if (account.status === 'loading' || (account.status === 'member' && partner === null)) {
    return <div className="min-h-dvh bg-canvas" />;
  }
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  if (!partner) return <Navigate to="/partner" replace />;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await saveMyPartnerCard(heading, body);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announce('Your card is saved.');
  }

  const card = {
    name: account.displayName ?? '',
    title,
    heading: heading.trim() || DEFAULT_CARD_HEADING,
    body: body.trim() || DEFAULT_CARD_BODY,
    url: code ? qrJoinUrl(code) : null,
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[var(--me-measure)]">
          <BackLink to="/partner" label={PARTNER_ROLE_NAME} />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Your card
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
            Print it for your clinic, gym or front desk. Anyone who scans the code can join the
            club, as invited by you, until you turn the code off on the QR code page.
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[var(--me-measure)] items-start gap-6 px-4 pt-5 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form
          className="rounded-[14px] border border-line bg-paper p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="card-heading" className="block font-bold text-[0.8125rem] text-ink">
            Heading
          </label>
          <input
            id="card-heading"
            value={heading}
            maxLength={CARD_HEADING_MAX}
            placeholder={DEFAULT_CARD_HEADING}
            disabled={!loaded}
            aria-describedby="card-heading-count"
            onChange={(e) => {
              setHeading(e.target.value);
            }}
            className={FIELD}
          />
          <p id="card-heading-count" className="mt-1 text-[0.75rem] text-grey">
            {heading.length} of {CARD_HEADING_MAX}
          </p>

          <label htmlFor="card-body" className="mt-3 block font-bold text-[0.8125rem] text-ink">
            What it says
          </label>
          <textarea
            id="card-body"
            value={body}
            maxLength={CARD_BODY_MAX}
            rows={5}
            placeholder={DEFAULT_CARD_BODY}
            disabled={!loaded}
            aria-describedby="card-body-count"
            onChange={(e) => {
              setBody(e.target.value);
            }}
            className={cn(FIELD, 'resize-y')}
          />
          <p id="card-body-count" className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
            {body.length} of {CARD_BODY_MAX}. Left empty, the card uses the words shown in grey.
          </p>
          <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
            Your name and title ({title || 'set by an administrator'}) come from your profile.
          </p>

          {error ? (
            <p role="alert" className="mt-3 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!loaded || saving}
            className="mt-3.5 flex min-h-[48px] w-full items-center justify-center rounded-[11px] bg-action px-2 font-bold font-head text-[0.9375rem] text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save the card'}
          </button>
        </form>

        <section aria-labelledby="card-preview-heading" className="min-w-0">
          <h2 id="card-preview-heading" className="font-extrabold font-head text-[1rem] text-ink">
            Preview
          </h2>
          <SegmentPills segments={SIZES} value={size} onChange={setSize} />
          {size === 'business' ? (
            <p className="mb-2 text-[0.75rem] text-grey leading-[1.45]">
              A business card has room for your name, title, heading and code. It prints{' '}
              {BUSINESS_SHEET.length} to a letter page; the words are on the half letter.
            </p>
          ) : null}
          {codeError ? (
            <p role="alert" className="mb-2 text-[0.8125rem] text-destructive">
              {codeError}
            </p>
          ) : null}
          <div className="rounded-[14px] border border-line bg-tint p-3">
            <PartnerCard size={size} {...card} />
          </div>
          <button
            type="button"
            disabled={!card.url}
            onClick={() => {
              window.print();
            }}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[11px] border-[1.6px] border-emphasis px-2 font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-40"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </button>
        </section>
      </div>

      {/* What prints: nothing else on the page (index.css, [data-print-card]). */}
      <div data-print-card={size} aria-hidden="true" className="hidden">
        {size === 'business' ? (
          BUSINESS_SHEET.map((slot) => <PartnerCard key={slot} size={size} {...card} />)
        ) : (
          <PartnerCard size={size} {...card} />
        )}
      </div>
    </div>
  );
}

/**
 * The card itself, sized by its own width so the preview and the print match:
 * every length inside is a share of the card's width (cqw).
 */
export function PartnerCard({
  size,
  name,
  title,
  heading,
  body,
  url,
}: {
  size: CardSize;
  name: string;
  title: string;
  heading: string;
  body: string;
  url: string | null;
}) {
  const qr = url ? (
    <QrCode text={url} label="QR code that opens the club's join page" />
  ) : (
    <div className="grid aspect-square w-full place-items-center bg-white text-[3cqw] text-[#444444]">
      Making your code…
    </div>
  );

  if (size === 'business') {
    return (
      <div
        data-card="business"
        className="mx-auto aspect-[3.5/2] w-full max-w-[3.5in] overflow-hidden bg-white text-[#111111] [container-type:inline-size]"
      >
        <div className="flex h-full items-stretch gap-[4cqw] p-[5cqw]">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-extrabold font-display text-[7cqw] leading-tight">{name}</p>
            {title ? <p className="mt-[1cqw] text-[4cqw] leading-snug">{title}</p> : null}
            <p className="mt-auto font-bold text-[4.6cqw] leading-snug">{heading}</p>
            <p className="mt-[1cqw] text-[3.2cqw] text-[#444444]">
              The SCI Club · {PARTNER_ROLE_NAME}
            </p>
          </div>
          <div className="flex w-[36cqw] flex-none flex-col justify-center">
            {qr}
            {url ? (
              <p className="mt-[1cqw] break-all text-center text-[2.2cqw] text-[#444444] leading-tight">
                {url.replace(/^https?:\/\//, '')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-card="half-letter"
      className="mx-auto aspect-[5.5/8.5] w-full max-w-[5.5in] overflow-hidden bg-white text-[#111111] [container-type:inline-size]"
    >
      <div className="flex h-full flex-col p-[7cqw]">
        <p className="font-semibold text-[3.4cqw] text-[#444444] uppercase tracking-[0.12em]">
          The SCI Club
        </p>
        <p className="mt-[3cqw] font-extrabold font-display text-[8cqw] leading-[1.1]">{heading}</p>
        <p className="mt-[3cqw] whitespace-pre-line text-[3.7cqw] leading-[1.45]">{body}</p>
        <div className="mx-auto mt-auto w-[56cqw] pt-[4cqw]">{qr}</div>
        {url ? (
          <p className="mt-[1.5cqw] break-all text-center text-[2.8cqw] text-[#444444]">
            {url.replace(/^https?:\/\//, '')}
          </p>
        ) : null}
        <div className="mt-[4cqw] border-[#111111] border-t pt-[3cqw]">
          <p className="font-extrabold font-head text-[5cqw] leading-tight">{name}</p>
          {title ? <p className="mt-[0.5cqw] text-[3.7cqw]">{title}</p> : null}
          <p className="mt-[0.5cqw] text-[3cqw] text-[#444444]">{PARTNER_ROLE_NAME}</p>
        </div>
      </div>
    </div>
  );
}
