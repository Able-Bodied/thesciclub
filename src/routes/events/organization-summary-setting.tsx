import { useState } from 'react';
import { setOrganizationSummary } from '@/lib/organization-members';
import { useOrganizations } from '@/lib/organizations';

const MOST = 90;

/**
 * The line on an organization's card, for its org admins and the club's
 * administrators (the owner, 2026-11-01).
 */
export function OrganizationSummarySetting({
  organizationId,
  summary,
}: {
  organizationId: string;
  summary: string | null;
}) {
  const { reload } = useOrganizations();
  const [saved, setSaved] = useState(summary ?? '');
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = draft.trim();

  function save() {
    setBusy(true);
    setError(null);
    void setOrganizationSummary(organizationId, text).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(text);
      setDraft(text);
      reload();
    });
  }

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-paper p-3.5">
      <label htmlFor="organization-summary" className="block font-bold text-[0.9375rem] text-ink">
        Card description
      </label>
      <input
        id="organization-summary"
        value={draft}
        maxLength={MOST}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        className="mt-1.5 min-h-[44px] w-full rounded-[10px] border-[1.6px] border-line bg-paper px-2.5 text-[1rem] text-ink"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-grey">
          {draft.length} of {MOST}
        </span>
        <button
          type="button"
          disabled={busy || text === saved}
          onClick={save}
          className="min-h-[44px] rounded-[10px] bg-action px-4 font-bold text-[0.8125rem] text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger-ink leading-[1.4]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
