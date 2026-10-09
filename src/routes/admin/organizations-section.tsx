import { useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { removeOrganization } from '@/lib/organization-management';
import { useOrganizations } from '@/lib/organizations';
import { SmallButton } from '@/routes/admin/controls';
import { OrganizationEditor } from '@/routes/admin/organization-editor';
import type { Organization } from '@/types/domain';

/** Administrators manage the directory. Organization accounts edit only their
 * linked entries; the database checks the same scope independently. */
export function OrganizationsSection({
  administrator = true,
  ids,
  onChange,
}: {
  administrator?: boolean;
  ids?: ReadonlySet<string>;
  onChange?: () => void;
}) {
  const { organizations, loading, error, reload } = useOrganizations();
  const [editing, setEditing] = useState<Organization | 'new' | null>(null);
  const [removing, setRemoving] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const announce = useAnnounce();
  const visible = administrator
    ? organizations
    : organizations.filter((organization) => ids?.has(organization.id));
  function changed() {
    reload();
    onChange?.();
  }
  return (
    <section>
      <h2 className="mt-4 font-extrabold font-head text-ink">Organizations</h2>
      {error || failure ? (
        <p role="alert" className="mt-2 text-destructive">
          {error ?? failure}
        </p>
      ) : null}
      {administrator && !editing ? (
        <button
          type="button"
          onClick={() => {
            setEditing('new');
          }}
          className="mt-2 min-h-[44px] rounded-lg bg-action px-4 font-bold text-white"
        >
          Add organization
        </button>
      ) : null}
      {editing ? (
        <OrganizationEditor
          key={editing === 'new' ? 'new' : editing.id}
          organization={editing === 'new' ? null : editing}
          administrator={administrator}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      ) : null}
      {loading ? (
        <p className="mt-3 text-grey">Loading organizations…</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[14px] border border-line bg-paper">
          {visible.length === 0 ? (
            <p className="p-3 text-grey">
              {administrator
                ? 'No organizations yet.'
                : 'An administrator can link your account to the organizations you manage.'}
            </p>
          ) : (
            visible.map((organization) => (
              <div
                key={organization.id}
                className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <h3 className="font-bold text-ink">{organization.name}</h3>
                  <p className="text-[0.8125rem] text-grey">
                    {organization.shortCode} · {organization.city}
                  </p>
                </div>
                <SmallButton
                  aria-label={`Edit ${organization.name}`}
                  onClick={() => {
                    setFailure(null);
                    setEditing(organization);
                  }}
                >
                  Edit
                </SmallButton>
                {administrator ? (
                  <SmallButton
                    destructive
                    aria-label={`Remove ${organization.name}`}
                    onClick={() => {
                      setFailure(null);
                      setRemoving(organization);
                    }}
                  >
                    Remove
                  </SmallButton>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
      {removing ? (
        <div className="mt-3 rounded-[14px] border border-destructive/30 bg-paper p-3">
          <p className="text-ink">Remove {removing.name} from the directory?</p>
          <p className="mt-1 text-[0.8125rem] text-grey">
            Its representative links will be removed. Existing events and invites stay on record.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy}
              type="button"
              className="min-h-[44px] rounded-lg bg-destructive px-4 font-bold text-white disabled:opacity-50"
              onClick={() => {
                setBusy(true);
                void removeOrganization(removing.id)
                  .then((result) => {
                    if (result.ok) {
                      setRemoving(null);
                      setEditing(null);
                      announce('Organization removed.');
                      changed();
                    } else setFailure(result.error ?? 'The organization was not removed.');
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {busy ? 'Removing…' : 'Remove organization'}
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                setRemoving(null);
              }}
              className="min-h-[44px] rounded-lg border border-line px-4 text-ink"
            >
              Keep organization
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
