import { useState } from 'react';
import { useAccount } from '@/lib/account';
import { inviteToOrganization } from '@/lib/organization-members';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';

/**
 * On a profile, for an org admin (the owner, 2026-10-30): a button for each of
 * their organizations this member is not in. It sends a direct message with
 * the organization's page; they still press Join themselves. The database
 * allows it once for each organization and member.
 */
export function InviteToOrganization({
  memberId,
  name,
  memberOf,
}: {
  memberId: string;
  name: string;
  /** The organizations they are in, shown on their profile. */
  memberOf: readonly string[];
}) {
  const account = useAccount();
  const mine = useMyOrganizations(account.userId);
  const { byId } = useOrganizations();
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (account.userId === null || account.userId === memberId) return null;
  const organizations = [...mine.ids]
    .filter((id) => !memberOf.includes(id))
    .map((id) => byId.get(id))
    .filter((organization) => organization !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (organizations.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {organizations.map((organization) => (
        <button
          key={organization.id}
          type="button"
          disabled={busy !== null || sent.has(organization.id)}
          onClick={() => {
            setBusy(organization.id);
            setError(null);
            void inviteToOrganization(organization.id, memberId).then((result) => {
              setBusy(null);
              if (result.ok) setSent((now) => new Set(now).add(organization.id));
              else setError(result.error);
            });
          }}
          className="flex min-h-[46px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis px-3 font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-60"
        >
          {sent.has(organization.id)
            ? `Invited to ${organization.name}`
            : `Invite ${name} to join ${organization.name}`}
        </button>
      ))}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
