import { useCallback, useEffect, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import {
  californiaToday,
  type Grant,
  type GrantDraft,
  type GrantWindow,
  grantDay,
  grantStatus,
  loadOrganizationGrants,
  removeGrant,
  saveGrant,
} from '@/lib/grants';

/**
 * An organization's grants, on Admin under its form (20261021030000): add,
 * change or remove a grant and its rounds. A round is dated, or comes back
 * every year on the same days. Followers are told when a round opens, once.
 */

const field =
  'mt-1 min-h-[44px] w-full rounded-[11px] border border-line bg-paper px-3 py-2 text-[1rem] text-ink';
const MAX_ROUNDS = 6;

function statusLine(grant: Grant, today: string): string {
  const status = grantStatus(grant, today);
  switch (status.kind) {
    case 'open':
      return `Open now, until ${grantDay(status.closes, today)}`;
    case 'upcoming':
      return `Opens ${grantDay(status.opens, today)}, closes ${grantDay(status.closes, today)}`;
    case 'any_time':
      return 'Apply any time';
    default:
      return 'No dates for the next round';
  }
}

function GrantForm({
  organizationId,
  grant,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  grant: Grant | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<GrantDraft>(
    grant ?? { name: '', url: 'https://', summary: '', applyAnyTime: false, windows: [] },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const announce = useAnnounce();

  const setWindow = (index: number, change: Partial<GrantWindow>) => {
    setDraft({
      ...draft,
      windows: draft.windows.map((w, i) => (i === index ? { ...w, ...change } : w)),
    });
  };

  return (
    <form
      className="mt-2 grid gap-3 rounded-[12px] border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError(null);
        void saveGrant(organizationId, grant?.id ?? null, draft)
          .then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            announce('Grant saved.');
            onSaved();
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <h4 className="font-bold text-ink">{grant ? `Edit ${grant.name}` : 'Add a grant'}</h4>
      <fieldset disabled={saving} className="grid gap-3">
        <label className="text-ink">
          Name
          <input
            className={field}
            required
            maxLength={120}
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
        </label>
        <label className="text-ink">
          Link
          <input
            className={field}
            required
            type="url"
            pattern="https://.+"
            maxLength={2000}
            value={draft.url}
            onChange={(event) => {
              setDraft({ ...draft, url: event.target.value });
            }}
          />
          <span className="text-[0.8125rem] text-grey">The page to read about it or apply.</span>
        </label>
        <label className="text-ink">
          What it pays for, and who can apply
          <textarea
            className={field}
            rows={3}
            maxLength={400}
            value={draft.summary}
            onChange={(event) => {
              setDraft({ ...draft, summary: event.target.value });
            }}
          />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-ink">
          <input
            type="checkbox"
            checked={draft.applyAnyTime}
            onChange={(event) => {
              setDraft({ ...draft, applyAnyTime: event.target.checked });
            }}
          />
          Apply any time
        </label>

        <div>
          <p className="text-ink">Rounds</p>
          <p className="text-[0.8125rem] text-grey">
            {draft.applyAnyTime
              ? 'Leave empty for a grant open all year.'
              : 'When applications open and close. Members are told the day a round opens.'}
          </p>
          {draft.windows.map((w, index) => (
            <fieldset
              // biome-ignore lint/suspicious/noArrayIndexKey: rounds have no id until saved, and none reorders
              key={index}
              className="mt-2 grid gap-2 rounded-[11px] border border-line p-2.5"
            >
              <legend className="px-1 font-semibold text-[0.875rem] text-ink">
                Round {index + 1}
              </legend>
              <div className="flex flex-wrap gap-2">
                <label className="min-w-[9rem] flex-1 text-ink">
                  Opens
                  <input
                    className={field}
                    type="date"
                    required
                    value={w.opensOn}
                    onChange={(event) => {
                      setWindow(index, { opensOn: event.target.value });
                    }}
                  />
                </label>
                <label className="min-w-[9rem] flex-1 text-ink">
                  Closes
                  <input
                    className={field}
                    type="date"
                    required
                    value={w.closesOn}
                    onChange={(event) => {
                      setWindow(index, { closesOn: event.target.value });
                    }}
                  />
                </label>
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={w.yearly}
                  onChange={(event) => {
                    setWindow(index, { yearly: event.target.checked });
                  }}
                />
                Every year on these days
              </label>
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...draft, windows: draft.windows.filter((_, i) => i !== index) });
                }}
                className="min-h-[44px] justify-self-start rounded-lg px-3 font-bold text-destructive hover:bg-destructive/10"
              >
                Remove round {index + 1}
              </button>
            </fieldset>
          ))}
          {draft.windows.length < MAX_ROUNDS ? (
            <button
              type="button"
              onClick={() => {
                const today = californiaToday();
                setDraft({
                  ...draft,
                  windows: [...draft.windows, { opensOn: today, closesOn: today, yearly: false }],
                });
              }}
              className="mt-2 min-h-[44px] rounded-lg border border-line px-4 font-bold text-ink"
            >
              Add a round
            </button>
          ) : null}
        </div>

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
            {saving ? 'Saving…' : 'Save grant'}
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

export function OrganizationGrantsEditor({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Grant | 'new' | null>(null);
  const [removing, setRemoving] = useState<Grant | null>(null);
  const announce = useAnnounce();
  const today = californiaToday();

  const reload = useCallback(async () => {
    const result = await loadOrganizationGrants(organizationId);
    setGrants(result.grants);
    setError(result.error);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section
      aria-labelledby="grants-editor-heading"
      className="mt-3 rounded-[14px] border border-line bg-paper p-3"
    >
      <h3 id="grants-editor-heading" className="font-bold text-ink">
        {organizationName}’s grants
      </h3>
      <p className="text-[0.8125rem] text-grey">
        Shown on its page. Its members are told when a round opens.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-2 text-grey">Loading grants…</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {grants.length === 0 ? <li className="py-2 text-grey">No grants yet.</li> : null}
          {grants.map((grant) =>
            editing !== 'new' && editing?.id === grant.id ? (
              <li key={grant.id} className="py-2">
                <GrantForm
                  organizationId={organizationId}
                  grant={grant}
                  onCancel={() => {
                    setEditing(null);
                  }}
                  onSaved={() => {
                    setEditing(null);
                    void reload();
                  }}
                />
              </li>
            ) : (
              <li key={grant.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <p className="font-bold text-ink">{grant.name}</p>
                  <p className="text-[0.8125rem] text-grey">{statusLine(grant, today)}</p>
                </div>
                {removing?.id === grant.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink">Remove {grant.name}?</span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeGrant(grant.id).then((result) => {
                          setRemoving(null);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          announce('Grant removed.');
                          void reload();
                        });
                      }}
                      className="min-h-[44px] rounded-lg bg-destructive-fill px-4 font-bold text-white"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(null);
                      }}
                      className="min-h-[44px] rounded-lg border border-line px-4 font-bold text-ink"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      aria-label={`Edit ${grant.name}`}
                      onClick={() => {
                        setError(null);
                        setEditing(grant);
                      }}
                      className="min-h-[44px] rounded-lg border border-line px-3 font-bold text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${grant.name}`}
                      onClick={() => {
                        setError(null);
                        setRemoving(grant);
                      }}
                      className="min-h-[44px] rounded-lg px-3 font-bold text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {editing === 'new' ? (
        <GrantForm
          organizationId={organizationId}
          grant={null}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      ) : editing === null ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing('new');
          }}
          className="mt-2 min-h-[44px] rounded-lg bg-action px-4 font-bold text-white"
        >
          Add a grant
        </button>
      ) : null}
    </section>
  );
}
