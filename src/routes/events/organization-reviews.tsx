import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { fetchMemberReviews, type MemberReview, useReviewMember } from '@/lib/organization-members';

/**
 * For an organization's org admins (the owner, 2026-10-30): somebody who
 * pressed Join is a member at once, and this is where they are approved, or
 * denied with a reason, which reaches them as a direct message. Denied people
 * stay listed, so a denial can be taken back.
 */
export function OrganizationReviews({
  organizationId,
  onChanged,
}: {
  organizationId: string;
  onChanged: () => void;
}) {
  const [reviews, setReviews] = useState<MemberReview[]>([]);
  const [denying, setDenying] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    void fetchMemberReviews(organizationId).then((result) => {
      if (result.ok) setReviews(result.value);
    });
  }, [organizationId]);

  useEffect(load, [load]);

  const done = useCallback(() => {
    setDenying(null);
    setReason('');
    load();
    onChanged();
  }, [load, onChanged]);
  const { review, error } = useReviewMember(organizationId, done);

  const waiting = reviews.filter((r) => r.deniedAt === null);
  const denied = reviews.filter((r) => r.deniedAt !== null);
  if (reviews.length === 0) return null;

  const who = (person: MemberReview) => (
    <Link to={`/peers/${person.id}`} className="flex min-w-0 items-center gap-2.5">
      <MemberAvatar
        id={person.id}
        displayName={person.displayName}
        photoPath={person.photoPath}
        photoAlt={person.photoAlt}
      />
      <span className="min-w-0 font-bold text-[0.9375rem] text-ink">{person.displayName}</span>
    </Link>
  );

  return (
    <>
      {waiting.length > 0 ? (
        <>
          <h2 className="mt-5 mb-1 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            New members to review ({waiting.length})
          </h2>
          <p className="mb-2.5 text-[0.78125rem] text-grey">
            They are members already. Only org admins see this.
          </p>
          <ul className="rounded-[14px] border border-line bg-paper px-3.5">
            {waiting.map((person) => (
              <li key={person.id} className="border-line border-b py-3 last:border-b-0">
                {who(person)}
                {denying === person.id ? (
                  <div className="mt-2.5">
                    <label
                      htmlFor={`deny-${person.id}`}
                      className="block font-bold text-[0.8125rem] text-ink"
                    >
                      Why? {person.displayName} will read this.
                    </label>
                    <textarea
                      id={`deny-${person.id}`}
                      rows={3}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                      }}
                      className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDenying(null);
                          setReason('');
                        }}
                        className="min-h-[44px] rounded-[11px] border-[1.6px] border-line font-bold text-[0.875rem] text-ink2"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={reason.trim() === ''}
                        onClick={() => {
                          void review(person.id, false, reason);
                        }}
                        className="min-h-[44px] rounded-[11px] bg-destructive font-bold text-[0.875rem] text-white disabled:opacity-50"
                      >
                        Deny and send
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void review(person.id, true);
                      }}
                      aria-label={`Approve ${person.displayName}`}
                      className="min-h-[44px] rounded-[11px] bg-action font-bold text-[0.875rem] text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDenying(person.id);
                        setReason('');
                      }}
                      aria-label={`Deny ${person.displayName}`}
                      className="min-h-[44px] rounded-[11px] border-[1.6px] border-line font-bold text-[0.875rem] text-ink2"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {denied.length > 0 ? (
        <>
          <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            Denied ({denied.length})
          </h2>
          <ul className="rounded-[14px] border border-line bg-paper px-3.5">
            {denied.map((person) => (
              <li key={person.id} className="border-line border-b py-3 last:border-b-0">
                {who(person)}
                <p className="mt-1.5 text-[0.8125rem] text-ink2 leading-[1.45]">
                  {person.deniedReason}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void review(person.id, true);
                  }}
                  aria-label={`Let ${person.displayName} back in`}
                  className="mt-1 min-h-[44px] font-bold text-[0.8125rem] text-emphasis underline"
                >
                  Let them back in
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
