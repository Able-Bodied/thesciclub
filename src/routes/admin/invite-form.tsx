import { useEffect, useState } from 'react';
import { formatPhoneInput, isCompletePhone } from '@/lib/phone';
import {
  type ClaimableProfile,
  createInvite,
  fetchClaimableProfiles,
  fetchInvitingOrganizations,
  type InvitingOrganization,
} from '@/routes/admin/members-admin';

/**
 * Putting a number on the list.
 *
 * The claim selector is the important control here, and the reason it lives on
 * this form rather than in signup: attaching a seeded profile to an invite is
 * an assertion that this number belongs to that person. An organization is in a
 * position to make it. The person signing up is not — they could claim to be
 * anybody, and the profile they walked off with would be somebody's real one.
 *
 * It only lists seeded people nobody has joined as yet, so the same profile
 * cannot be promised twice.
 */
export function InviteForm({ onCreated }: { onCreated: () => void }) {
  const [organizations, setOrganizations] = useState<InvitingOrganization[]>([]);
  const [claimable, setClaimable] = useState<ClaimableProfile[]>([]);
  const [phone, setPhone] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [claimMemberId, setClaimMemberId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchInvitingOrganizations().then((orgs) => {
      setOrganizations(orgs);
      setOrganizationId((current) => current || (orgs[0]?.id ?? ''));
    });
    void fetchClaimableProfiles().then(setClaimable);
  }, []);

  const ready = isCompletePhone(phone) && organizationId !== '';

  function submit() {
    setBusy(true);
    setError(null);
    createInvite({
      phone,
      organizationId,
      claimMemberId: claimMemberId || null,
      note: note.trim() || null,
    })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not add that number.');
          return;
        }
        setPhone('');
        setClaimMemberId('');
        setNote('');
        void fetchClaimableProfiles().then(setClaimable);
        onCreated();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not add that number.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <div className="rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="invite-phone" className="block font-bold text-[0.75rem] text-ink">
            Phone number
          </label>
          <input
            id="invite-phone"
            type="tel"
            inputMode="tel"
            placeholder="(408) 555-0112"
            value={phone}
            onChange={(e) => {
              setPhone(formatPhoneInput(e.target.value));
            }}
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy"
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
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="invite-claim" className="block font-bold text-[0.75rem] text-ink">
            Is this someone already in the directory?
          </label>
          <select
            id="invite-claim"
            value={claimMemberId}
            onChange={(e) => {
              setClaimMemberId(e.target.value);
            }}
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy"
          >
            <option value="">No — a new member</option>
            {claimable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.city ? ` — ${m.city}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px] flex-1">
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
            className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy"
          />
        </div>
      </div>

      {claimMemberId ? (
        <p className="mt-2.5 rounded-r-[9px] border-gold border-l-[3px] bg-gold-lt px-3 py-2 text-[0.75rem] text-[#5C4409] leading-[1.45]">
          Whoever verifies this number will be offered that profile. Attach it only if you know the
          number belongs to them.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2.5 text-[0.78125rem] text-destructive leading-[1.45]">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={submit}
        className="mt-3 flex min-h-[42px] w-full items-center justify-center rounded-[11px] bg-navy font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
      >
        {busy ? 'Adding…' : 'Add to the list'}
      </button>
    </div>
  );
}
