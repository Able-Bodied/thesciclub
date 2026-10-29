import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  fetchInviteRequestChoices,
  type InviteRequestChoice,
  requestInvite,
} from '@/lib/invite-requests';
import { InviteChoiceList } from '@/routes/request-invite/choice-list';

/**
 * Asking for an invite, signed out (the owner, 2026-10-28; 20261029030000).
 *
 * Every organization that can invite, each with its org admins by first name
 * only, since anybody can open this page. Tapping one opens a short form:
 * name, email, an optional note. It goes to that org admin in the app.
 *
 * "Sent" is said the same whatever happens to the address afterwards, so the
 * page never tells anybody whether an email is a member's, invited or blocked.
 */

const FIELD =
  'mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none focus:border-emphasis';
const LABEL = 'mt-4 block font-bold text-[0.8125rem] text-ink';

export interface PickedAdmin {
  organizationId: string;
  adminId: string;
}

interface Chosen {
  organization: InviteRequestChoice;
  adminId: string;
  firstName: string;
}

export default function RequestInvitePage() {
  const location = useLocation();
  const [choices, setChoices] = useState<InviteRequestChoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  // Somebody tapped a name on the blocked screen: that one is chosen already.
  const picked = (location.state as { picked?: PickedAdmin } | null)?.picked;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchInviteRequestChoices().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setChoices(result.value);
      const organization = result.value.find((o) => o.organizationId === picked?.organizationId);
      const admin = organization?.admins.find((a) => a.id === picked?.adminId);
      if (organization && admin) {
        setChosen({ organization, adminId: admin.id, firstName: admin.firstName });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [picked?.organizationId, picked?.adminId]);

  const ready = name.trim() !== '' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit() {
    if (!chosen || !ready || sending) return;
    setSending(true);
    setError(null);
    const result = await requestInvite({
      organizationId: chosen.organization.organizationId,
      adminId: chosen.adminId,
      name,
      email,
      note,
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] bg-canvas px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Link to="/join" className="inline-block py-2 font-bold text-[0.875rem] text-emphasis">
        ← Back
      </Link>
      <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink leading-tight">
        Request an invite
      </h1>

      {sent && chosen ? (
        <div role="status" className="mt-4 rounded-[14px] border border-line bg-paper p-4">
          <p className="font-extrabold font-head text-[0.9375rem] text-ink">Request sent</p>
          <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.5]">
            {chosen.firstName} from {chosen.organization.name} will see it in the app. If they
            invite you, the invitation comes to <b className="text-ink">{email.trim()}</b>.
          </p>
          <Link
            to="/join"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold"
          >
            Done
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[0.9375rem] text-ink2 leading-[1.5]">
            <b className="text-ink">Joining The SCI Club is by invitation only.</b> These
            organizations can invite you. <b className="text-ink">Tap a name</b> to ask that person
            for an invite.
          </p>

          {loadError ? (
            <p role="alert" className="mt-4 text-[0.875rem] text-destructive">
              {loadError}
            </p>
          ) : null}
          {choices === null && !loadError ? (
            <p className="mt-4 text-[0.875rem] text-grey">Loading…</p>
          ) : null}
          {choices?.length === 0 ? (
            <p className="mt-4 text-[0.875rem] text-ink2">
              Nobody can take requests right now. Please try again later.
            </p>
          ) : null}

          {choices && choices.length > 0 ? (
            <InviteChoiceList
              choices={choices}
              isOn={(organization, admin) =>
                chosen?.adminId === admin.id &&
                chosen.organization.organizationId === organization.organizationId
              }
              onPick={(organization, admin) => {
                setChosen({ organization, adminId: admin.id, firstName: admin.firstName });
                setError(null);
              }}
            />
          ) : null}

          {chosen ? (
            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h2 className="font-extrabold font-head text-[1.0625rem] text-ink">
                Ask {chosen.firstName} from {chosen.organization.name}
              </h2>
              <label htmlFor="request-name" className={LABEL}>
                Your name
              </label>
              <input
                id="request-name"
                autoComplete="name"
                maxLength={100}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                className={FIELD}
              />
              <label htmlFor="request-email" className={LABEL}>
                Email
              </label>
              <input
                id="request-email"
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
              <label htmlFor="request-note" className={LABEL}>
                A note (optional)
              </label>
              <textarea
                id="request-note"
                rows={3}
                maxLength={500}
                placeholder="How you heard about the club, or how you know them"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                className={FIELD}
              />
              <p className="mt-2 text-[0.78125rem] text-grey leading-[1.45]">
                The org admins of {chosen.organization.name} see your name, email and note, only to
                decide whether to invite you.
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
                {sending ? 'Sending…' : `Send request to ${chosen.firstName}`}
              </button>
            </form>
          ) : null}
        </>
      )}
    </main>
  );
}
