import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { type ReadSheet, readSheet, SHEET_LIMIT, sheetCsvUrl } from '@/lib/invite-sheet';
import { useMemberOrganizations } from '@/lib/organization-members';
import { sendInvite } from '@/lib/send-invite';
import {
  fetchInvitingOrganizations,
  type InvitingOrganization,
  inviteList,
  type ListOutcome,
} from '@/routes/admin/members-admin';
import { inviteEmail } from '../../../supabase/functions/send-invite/compose';

/**
 * Inviting a list at once, from a Google Sheet or rows pasted out of any
 * spreadsheet (the owner, 2026-11-14). Every email comes from this
 * administrator by name, with the organization they pick and their own words.
 *
 * The list goes on the club's list in one call; the emails then go one at a
 * time, a little apart, so the email service is not asked for them all in the
 * same second. One that fails stays on the list with Resend, like any invite.
 */

/** Between two emails: the email service takes about two a second. */
const GAP_MS = 600;

const SKIPPED: Record<Exclude<ListOutcome, 'added'>, string> = {
  member: 'already in the club',
  on_list: 'already invited',
  blocked: 'blocked from the club',
  not_an_email: 'not an email address',
  repeat: 'twice in the list',
};

interface Line {
  email: string;
  name: string | null;
  state: 'waiting' | 'sent' | 'failed' | 'skipped';
  why?: string;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function InviteSheet({ onCreated }: { onCreated: () => void }) {
  const account = useAccount();
  const [inviting, setInviting] = useState<InvitingOrganization[]>([]);
  const memberOf = useMemberOrganizations(
    account.status === 'member' ? (account.userId ?? undefined) : undefined,
  );
  const organizations = inviting.filter((o) => memberOf.includes(o.id));
  const [link, setLink] = useState('');
  const [pasted, setPasted] = useState('');
  const [fromLink, setFromLink] = useState<ReadSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void fetchInvitingOrganizations().then(setInviting);
  }, []);

  // One organization of theirs is the one they mean; with several, they pick.
  const chosen = organizationId ?? (organizations.length === 1 ? (organizations[0]?.id ?? '') : '');
  const organizationName = organizations.find((o) => o.id === chosen)?.name ?? null;

  const read = useMemo(() => (pasted.trim() ? readSheet(pasted) : fromLink), [pasted, fromLink]);
  const people = read?.people ?? [];
  const tooMany = people.length > SHEET_LIMIT;

  const preview = useMemo(
    () =>
      inviteEmail(
        {
          inviter: account.displayName ?? 'You',
          organization: organizationName,
          name: people[0]?.name ?? null,
          message: message.trim() || null,
        },
        'https://thesciclub.com/join?invite=…',
      ),
    [account.displayName, organizationName, people, message],
  );

  async function readLink() {
    const url = sheetCsvUrl(link);
    if (!url) {
      setError('That is not a Google Sheets link. Copy it from the sheet’s Share button.');
      return;
    }
    setReading(true);
    setError(null);
    try {
      const response = await fetch(url);
      const text = await response.text();
      // A sheet that is not shared answers with Google's sign-in page.
      if (!response.ok || /^\s*<!doctype html|<html/i.test(text)) {
        setError(
          'Google did not let the club read that sheet. In the sheet, press Share, set General access to “Anyone with the link”, and try again.',
        );
        setFromLink(null);
        return;
      }
      setPasted('');
      setFromLink(readSheet(text));
    } catch (e) {
      setError(describeThrown(e, 'The sheet could not be read. Check the link and try again.'));
    } finally {
      setReading(false);
    }
  }

  async function send() {
    if (people.length === 0 || tooMany) return;
    const count = people.length;
    if (
      !window.confirm(
        `Send ${count} invite email${count === 1 ? '' : 's'} from you${organizationName ? `, with ${organizationName}` : ''}?`,
      )
    )
      return;
    setSending(true);
    setError(null);
    try {
      const added = await inviteList({
        people,
        organizationId: chosen || null,
        message: message.trim() || null,
      });
      if (!added.ok) {
        setError(added.error);
        return;
      }
      const next: Line[] = added.entries.map((e) => ({
        email: e.email,
        name: e.name,
        state: e.outcome === 'added' ? 'waiting' : 'skipped',
        ...(e.outcome === 'added' ? {} : { why: SKIPPED[e.outcome] }),
      }));
      setLines([...next]);
      onCreated();
      let first = true;
      for (const [i, entry] of added.entries.entries()) {
        if (entry.outcome !== 'added' || !entry.inviteId) continue;
        if (!first) await wait(GAP_MS);
        first = false;
        const sent = await sendInvite(entry.inviteId);
        next[i] = {
          ...next[i],
          email: entry.email,
          name: entry.name,
          state: sent.ok ? 'sent' : 'failed',
          ...(sent.ok ? {} : { why: sent.error }),
        };
        setLines([...next]);
      }
      onCreated();
    } catch (e) {
      setError(describeThrown(e, 'The invites did not all go. Check the list below.'));
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setLines(null);
    setLink('');
    setPasted('');
    setFromLink(null);
    setMessage('');
    setError(null);
  }

  const field =
    'mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis disabled:opacity-40';
  const label = 'block font-bold text-[0.75rem] text-ink';

  if (lines) {
    const sent = lines.filter((l) => l.state === 'sent').length;
    const waiting = lines.filter((l) => l.state === 'waiting').length;
    return (
      <div className="p-3.5">
        <p role="status" aria-live="polite" className="font-bold text-[0.875rem] text-ink">
          {waiting > 0
            ? `Sending… ${sent} of ${sent + waiting} sent`
            : `${sent} invite${sent === 1 ? '' : 's'} sent.`}
        </p>
        <ul className="mt-2.5 max-h-[22rem] overflow-y-auto rounded-[11px] border border-line">
          {lines.map((l) => (
            <li
              key={l.email}
              className="border-line border-b px-3 py-2 text-[0.8125rem] leading-[1.4] last:border-b-0"
            >
              <span className="block font-bold text-ink [overflow-wrap:anywhere]">
                {l.name ? `${l.name} · ` : ''}
                {l.email}
              </span>
              <span className={`block ${l.state === 'failed' ? 'text-destructive' : 'text-grey'}`}>
                {l.state === 'sent'
                  ? 'Sent'
                  : l.state === 'waiting'
                    ? 'Waiting…'
                    : l.state === 'failed'
                      ? `On the list, but the email did not go: ${l.why ?? ''} Use Resend.`
                      : `Skipped: ${l.why ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-2.5 text-[0.78125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={sending}
          onClick={startOver}
          className="mt-3 flex min-h-[42px] w-full items-center justify-center rounded-[11px] border border-line font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-40"
        >
          Start a new list
        </button>
      </div>
    );
  }

  return (
    <div className="p-3.5">
      <label htmlFor="sheet-link" className={label}>
        Google Sheet link
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="sheet-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis"
        />
        <button
          type="button"
          disabled={!link.trim() || reading}
          onClick={() => {
            void readLink();
          }}
          className="min-h-[42px] flex-none rounded-[11px] bg-tint px-3.5 font-bold font-head text-[0.8125rem] text-emphasis disabled:opacity-40"
        >
          {reading ? 'Reading…' : 'Read it'}
        </button>
      </div>
      <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
        In the sheet, press Share and set General access to “Anyone with the link”. It needs a
        column of email addresses; a First name or Name column is used to greet each person.
      </p>

      <label htmlFor="sheet-paste" className={`${label} mt-3`}>
        Or paste the rows
      </label>
      <textarea
        id="sheet-paste"
        rows={3}
        placeholder={'Ana Ruiz\tana@example.com\nbo@example.com'}
        value={pasted}
        onChange={(e) => {
          setPasted(e.target.value);
        }}
        className={field}
      />

      {read ? (
        <div className="mt-3">
          <p className="font-bold text-[0.8125rem] text-ink">
            {people.length === 0
              ? 'No email addresses found.'
              : `${people.length} ${people.length === 1 ? 'person' : 'people'} to invite`}
            {read.repeats > 0 ? ` · ${read.repeats} repeated, kept once` : ''}
          </p>
          {people.length > 0 ? (
            <ul className="mt-1.5 max-h-[11rem] overflow-y-auto rounded-[11px] border border-line text-[0.8125rem]">
              {people.map((p) => (
                <li
                  key={p.email}
                  className="border-line border-b px-3 py-1.5 last:border-b-0 [overflow-wrap:anywhere]"
                >
                  {p.name ? <span className="font-bold text-ink">{p.name} · </span> : null}
                  <span className="text-ink2">{p.email}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {read.skipped.length > 0 ? (
            <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
              {read.skipped.length} row{read.skipped.length === 1 ? '' : 's'} without an email
              address left out.
            </p>
          ) : null}
          {tooMany ? (
            <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
              Up to {SHEET_LIMIT} at a time. Split the list and send it in parts.
            </p>
          ) : null}
        </div>
      ) : null}

      <label htmlFor="sheet-organization" className={`${label} mt-3`}>
        They join with
      </label>
      <select
        id="sheet-organization"
        value={chosen}
        onChange={(e) => {
          setOrganizationId(e.target.value);
        }}
        className={field}
      >
        <option value="">Just the club</option>
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>

      <label htmlFor="sheet-message" className={`${label} mt-3`}>
        Your message (optional)
      </label>
      <textarea
        id="sheet-message"
        rows={3}
        maxLength={1000}
        placeholder="We would love to have you in the club."
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
        }}
        className={field}
      />
      <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
        Quoted in the email, from you. Others can see an inbox, so keep it general.
      </p>

      <details className="mt-3 rounded-[11px] border border-line">
        <summary className="cursor-pointer px-3 py-2 font-bold text-[0.8125rem] text-emphasis">
          See the email
        </summary>
        <div className="border-line border-t px-3 py-2.5 text-[0.8125rem] leading-[1.5]">
          <p className="text-grey">From: {preview.senderName}</p>
          <p className="text-grey">Subject: {preview.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
            {preview.text}
          </p>
        </div>
      </details>

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={people.length === 0 || tooMany || sending}
        onClick={() => {
          void send();
        }}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
      >
        {people.length === 0
          ? 'Send the invites'
          : `Send ${people.length} invite${people.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
