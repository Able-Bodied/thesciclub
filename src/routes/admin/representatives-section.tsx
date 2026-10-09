import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { describeThrown } from '@/lib/describe-error';
import {
  addRepresentative,
  fetchRepresentatives,
  type Representative,
  removeRepresentative,
} from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { SmallButton } from '@/routes/admin/controls';
import type { AdminMember } from '@/routes/admin/members-admin';

/**
 * Who speaks for which organization (20261005010000), for an administrator.
 *
 * A member linked here can add events for that organization, and change or
 * delete the ones added in the club, and invite without a cap. Organization
 * accounts can also edit their linked organizations' details. The owner chose an in-app
 * control for it, where the administrator flag is set only in the database.
 *
 * Unlinking leaves the organization's events where they are. They are the
 * organization's, not the person's.
 *
 * Only members who have joined and are active are offered: a directory row
 * from the seed is nobody anybody could sign in as, and `admin_add_representative`
 * refuses both anyway.
 */
export function RepresentativesSection({ members }: { members: AdminMember[] }) {
  const { organizations, byId, loading: organizationsLoading } = useOrganizations();
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchRepresentatives();
    if (result.ok) {
      setRepresentatives(result.representatives);
      setError(null);
    } else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    action()
      .then(async (result) => {
        if (!result.ok) {
          setError(result.error ?? 'That did not work.');
          return;
        }
        await load();
        if (key === 'add') setMemberId('');
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusy(null);
      });
  }

  const eligible = members
    .filter((m) => !m.isSeed && m.status === 'active')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const alreadyLinked = representatives.some(
    (r) => r.organizationId === organizationId && r.memberId === memberId,
  );

  // Grouped by organization, in the directory's own order.
  const byOrganization = organizations
    .map((o) => ({
      organization: o,
      people: representatives.filter((r) => r.organizationId === o.id),
    }))
    .filter((group) => group.people.length > 0);

  return (
    <>
      <h2 className="mt-4 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        Who speaks for an organization
      </h2>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        A member linked to an organization can add events for it from Events, and change or delete
        the ones added in the club, and invite people without a limit. Organization accounts can
        also edit their linked organizations. Unlinking leaves existing events and invites intact.
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
        >
          {error}
        </p>
      ) : null}

      <div className="rounded-[14px] border border-line bg-paper p-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[180px] flex-1">
            <label htmlFor="rep-organization" className="block font-bold text-[0.75rem] text-ink">
              Organization
            </label>
            <select
              id="rep-organization"
              value={organizationId}
              disabled={organizationsLoading}
              onChange={(e) => {
                setOrganizationId(e.target.value);
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
            >
              <option value="">Choose…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label htmlFor="rep-member" className="block font-bold text-[0.75rem] text-ink">
              Member
            </label>
            <select
              id="rep-member"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
            >
              <option value="">Choose…</option>
              {eligible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.city ? ` — ${m.city}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        {alreadyLinked ? (
          <p className="mt-2 text-[0.75rem] text-grey">They already speak for it.</p>
        ) : null}
        <button
          type="button"
          disabled={!organizationId || !memberId || alreadyLinked || busy !== null}
          onClick={() => {
            run('add', () => addRepresentative(organizationId, memberId));
          }}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
        >
          {busy === 'add' ? 'Linking…' : 'Link them'}
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-[14px] border border-line bg-paper">
        {loading ? (
          <p className="py-6 text-center text-[0.8125rem] text-grey">Loading…</p>
        ) : byOrganization.length === 0 ? (
          <p className="px-3 py-6 text-center text-[0.8125rem] text-grey leading-[1.45]">
            Nobody speaks for an organization yet. Administrators can add events for any of them.
          </p>
        ) : (
          byOrganization.map(({ organization, people }) => (
            <div key={organization.id} className="border-line border-b p-3 last:border-b-0">
              <h3 className="font-extrabold font-head text-[0.90625rem] text-ink">
                {byId.get(organization.id)?.name ?? organization.name}
              </h3>
              <ul>
                {people.map((person) => {
                  const key = `${person.organizationId}:${person.memberId}`;
                  return (
                    <li key={key} className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-[0.84375rem] text-ink">
                        {person.displayName}
                        {person.memberStatus !== 'active' ? (
                          <span className="text-grey">
                            {' '}
                            · {person.memberStatus}, so cannot use it
                          </span>
                        ) : null}
                      </span>
                      {busy === key ? (
                        <Loader2 className="h-4 w-4 animate-spin text-grey" />
                      ) : (
                        <SmallButton
                          destructive
                          aria-label={`Unlink ${person.displayName} from ${organization.name}`}
                          onClick={() => {
                            run(key, () =>
                              removeRepresentative(person.organizationId, person.memberId),
                            );
                          }}
                        >
                          Unlink
                        </SmallButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
