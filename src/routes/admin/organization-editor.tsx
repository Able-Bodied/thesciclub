import { useEffect, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import {
  type OrganizationDraft,
  saveOrganization,
  saveOrganizationLogo,
} from '@/lib/organization-management';
import { usePhotoUrl } from '@/lib/photos';
import type { Organization } from '@/types/domain';

/** What Save does to the logo: leave it, replace it, or take it away. */
type LogoChange = { kind: 'keep' } | { kind: 'new'; file: File } | { kind: 'remove' };

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
  /** `warning` when the organization saved and its new logo did not. */
  onSaved: (warning?: string) => void;
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
  const [logo, setLogo] = useState<LogoChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(null);
  const savedLogo = usePhotoUrl(organization?.logoPath);
  const shown = logo.kind === 'new' ? preview : logo.kind === 'remove' ? null : savedLogo;
  const announce = useAnnounce();
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Edit is pressed on a row that may be far down a long directory, and the
  // form opens above the list. Brought into view, with focus on its heading so
  // a screen reader starts there too. The heading and not the first box: on a
  // phone that would open the keyboard over the form being arrived at.
  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    form.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, []);

  // The chosen file, shown before anything is uploaded.
  useEffect(() => {
    if (logo.kind !== 'new') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo.file);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [logo]);

  async function save() {
    const result = await saveOrganization(organization?.id ?? null, {
      ...draft,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // After the words, because a new organization has no folder to put a
    // logo in until it has an id.
    if (logo.kind !== 'keep') {
      const saved = await saveOrganizationLogo(result.id, logo.kind === 'new' ? logo.file : null);
      if (!saved.ok) {
        onSaved(`${draft.name.trim()} was saved, but its logo was not: ${saved.error}`);
        return;
      }
    }
    announce('Organization saved.');
    onSaved();
  }

  return (
    <form
      ref={form}
      // Clear of Admin's sticky tabs when brought into view.
      className="mt-3 scroll-mt-20 rounded-[14px] border border-line bg-paper p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError(null);
        void save().finally(() => {
          setSaving(false);
        });
      }}
    >
      <h3 ref={heading} tabIndex={-1} className="font-bold text-ink outline-none">
        {organization ? `Edit ${organization.name}` : 'Add organization'}
      </h3>
      <fieldset disabled={saving} className="mt-2 grid gap-3">
        <div>
          <p id="organization-logo-label" className="text-ink">
            Logo
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            {/* As the badge draws it: on white, kept whole rather than cropped. */}
            <span className="grid h-[66px] w-[66px] flex-none place-items-center overflow-hidden rounded-[14px] border border-line bg-white">
              {shown ? (
                <img
                  src={shown}
                  alt={logo.kind === 'new' ? 'The logo you chose' : `${organization?.name} logo`}
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <span className="font-extrabold font-head text-[0.875rem] text-grey">
                  {draft.shortCode || '—'}
                </span>
              )}
            </span>
            <label className="flex min-h-[44px] cursor-pointer items-center rounded-lg border border-line px-4 font-bold text-ink focus-within:ring-2 focus-within:ring-emphasis">
              {shown ? 'Change logo' : 'Choose a logo'}
              <input
                type="file"
                // Not SVG: a drawing can carry script, and it is shown to
                // every member.
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
                aria-describedby="organization-logo-hint"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
                    setError('Choose a PNG, JPEG or WebP picture.');
                    return;
                  }
                  setError(null);
                  setLogo({ kind: 'new', file });
                }}
              />
            </label>
            {shown ? (
              <button
                type="button"
                onClick={() => {
                  setLogo(organization?.logoPath ? { kind: 'remove' } : { kind: 'keep' });
                }}
                className="min-h-[44px] rounded-lg px-3 font-bold text-destructive hover:bg-destructive/10"
              >
                Remove logo
              </button>
            ) : logo.kind === 'remove' ? (
              <button
                type="button"
                onClick={() => {
                  setLogo({ kind: 'keep' });
                }}
                className="min-h-[44px] rounded-lg px-3 font-bold text-emphasis hover:bg-tint"
              >
                Keep the logo
              </button>
            ) : null}
          </div>
          <span id="organization-logo-hint" className="mt-1 block text-[0.8125rem] text-grey">
            {logo.kind === 'remove'
              ? 'The logo comes off when you save. Its short code is shown instead.'
              : logo.kind === 'new'
                ? 'Saved when you save the organization.'
                : 'Shown on white beside its events. A square picture fits best.'}
          </span>
        </div>
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
