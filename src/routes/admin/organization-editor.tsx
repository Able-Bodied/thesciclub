import { useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { type OrganizationDraft, saveOrganization } from '@/lib/organization-management';
import type { Organization } from '@/types/domain';

const field =
  'mt-1 min-h-[44px] w-full rounded-[11px] border border-line bg-paper px-3 py-2 text-[1rem] text-ink';

export function OrganizationEditor({
  organization,
  administrator,
  onSaved,
  onCancel,
}: {
  organization: Organization | null;
  administrator: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<OrganizationDraft>(
    organization ?? {
      name: '',
      shortCode: '',
      city: '',
      description: '',
      tags: [],
      canInvite: true,
    },
  );
  const [tags, setTags] = useState(draft.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const announce = useAnnounce();
  return (
    <form
      className="mt-3 rounded-[14px] border border-line bg-paper p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError(null);
        void saveOrganization(organization?.id ?? null, {
          ...draft,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        })
          .then((result) => {
            if (result.ok) {
              announce('Organization saved.');
              onSaved();
            } else setError(result.error ?? 'The organization was not saved.');
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <h3 className="font-bold text-ink">
        {organization ? `Edit ${organization.name}` : 'Add organization'}
      </h3>
      <fieldset disabled={saving} className="mt-2 grid gap-3">
        <label className="text-ink">
          Organization name
          <input
            className={field}
            required
            maxLength={300}
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
        </label>
        <label className="text-ink">
          Short code
          <input
            className={field}
            required
            minLength={2}
            maxLength={4}
            pattern="[A-Za-z]{2,4}"
            value={draft.shortCode}
            onChange={(event) => {
              setDraft({ ...draft, shortCode: event.target.value.toUpperCase() });
            }}
          />
          <span className="text-[0.8125rem] text-grey">Two to four letters for its badge.</span>
        </label>
        <label className="text-ink">
          City or region
          <input
            className={field}
            required
            maxLength={160}
            value={draft.city}
            onChange={(event) => {
              setDraft({ ...draft, city: event.target.value });
            }}
          />
        </label>
        <label className="text-ink">
          Description
          <textarea
            className={field}
            rows={4}
            maxLength={4000}
            value={draft.description}
            onChange={(event) => {
              setDraft({ ...draft, description: event.target.value });
            }}
          />
        </label>
        <label className="text-ink">
          Tags
          <input
            className={field}
            maxLength={972}
            value={tags}
            onChange={(event) => {
              setTags(event.target.value);
            }}
          />
          <span className="text-[0.8125rem] text-grey">
            Up to twelve, separated by commas. Up to eighty characters each.
          </span>
        </label>
        {administrator ? (
          <label className="flex min-h-[44px] items-center gap-2 text-ink">
            <input
              type="checkbox"
              checked={draft.canInvite}
              onChange={(event) => {
                setDraft({ ...draft, canInvite: event.target.checked });
              }}
            />
            Can vouch for members
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-action px-4 font-bold text-white"
          >
            {saving ? 'Saving…' : 'Save organization'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-line px-4 font-bold text-ink"
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
