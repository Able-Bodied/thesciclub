import { useEffect, useState } from 'react';
import { looksLikeEmail } from '@/lib/auth-email';
import { describeThrown } from '@/lib/describe-error';
import {
  createInvite,
  fetchInvitingOrganizations,
  type InvitingOrganization,
} from '@/routes/admin/members-admin';

/**
 * Putting an address on the list, and emailing it the link.
 *
 * The list entry and the email are two steps. If the email fails the invite is
 * still on the list, so the form says so and the row has Resend; it does not
 * report a failure the administrator would answer by adding it a second time.
 */
export function InviteForm({ onCreated }: { onCreated: () => void }) {
  const [organizations, setOrganizations] = useState<InvitingOrganization[]>([]);
  const [email, setEmail] = useState('');
  // '' is the club itself — the administrator vouching in their own name —
  // rather than "nothing chosen"; picking an organization is the deliberate act.
  const [organizationId, setOrganizationId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void fetchInvitingOrganizations().then(setOrganizations);
  }, []);

  const ready = looksLikeEmail(email);

  function submit() {
    const address = email.trim();
    setBusy(true);
    setError(null);
    setDone(null);
    createInvite({
      email: address,
      organizationId: organizationId || null,
      note: note.trim() || null,
    })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not add that address.');
          return;
        }
        setEmail('');
        setNote('');
        if (result.sendError) setError(result.sendError);
        else setDone(`The link is on its way to ${address}.`);
        onCreated();
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Could not add that address.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <div className="rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="invite-email" className="block font-bold text-[0.75rem] text-ink">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis"
          />
        </div>

        <div className="min-w-[160px] flex-1">
          <label htmlFor="invite-org" className="block font-bold text-[0.75rem] text-ink">
            Vouched for by
          </label>
          <select
            id="invite-org"
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
            }}
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis"
          >
            <option value="">The club — you are vouching</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2.5">
        <label htmlFor="invite-note" className="block font-bold text-[0.75rem] text-ink">
          Note (optional)
        </label>
        <input
          id="invite-note"
          placeholder="Met at rugby practice"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis"
        />
      </div>

      <p className="mt-2.5 text-[0.75rem] text-grey leading-[1.45]">
        The club emails them a link to join. Anyone who opens it while signed in takes the invite,
        whatever address they signed up with.
      </p>

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-2.5 text-[0.78125rem] text-ink leading-[1.45]">
          {done}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={submit}
        className="mt-3 flex min-h-[42px] w-full items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
      >
        {busy ? 'Adding…' : 'Add and send the link'}
      </button>
    </div>
  );
}
