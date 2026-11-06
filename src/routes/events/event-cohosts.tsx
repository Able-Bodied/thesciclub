import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import { leaveEventCohost, setEventCohosts } from '@/lib/event-cohosts';
import { matchesOrganizationSearch } from '@/routes/admin/organizations-section';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { organizationTown } from '@/routes/events/organization-places';
import type { ClubEvent, Organization } from '@/types/domain';

const MOST_FOUND = 8;

/**
 * The co-hosts under "Hosted by" (20261105170000). The lead host's admins and
 * club administrators add and remove them, on any event, imported ones too; a
 * co-host's own admins can take their organization off.
 */
export function EventCohosts({
  event,
  organizations,
  byId,
  manages,
  mine,
  onChanged,
}: {
  event: ClubEvent;
  organizations: Organization[];
  byId: Map<string, Organization>;
  /** The lead host's admin, or a club administrator. */
  manages: boolean;
  /** The organizations the viewer speaks for. */
  mine: Set<string>;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const findId = useId();
  const [find, setFind] = useState('');
  const [later, setLater] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cohosts = event.cohostIds
    .map((id) => byId.get(id))
    .filter((o): o is Organization => o !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const repeats = event.seriesId !== null;
  const taken = new Set([
    ...event.cohostIds,
    ...(event.organizationId ? [event.organizationId] : []),
  ]);
  const found =
    find.trim() === ''
      ? []
      : organizations
          .filter((o) => !taken.has(o.id) && matchesOrganizationSearch(o, find))
          .slice(0, MOST_FOUND);

  if (cohosts.length === 0 && !manages) return null;

  const run = async (
    change: () => Promise<{ ok: true } | { ok: false; error: string }>,
    said: string,
  ) => {
    setBusy(true);
    setError(null);
    const result = await change();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFind('');
    announce(said);
    onChanged();
  };
  const alsoLater = repeats && later;

  return (
    <div className="mt-2 space-y-2">
      {cohosts.map((organization) => {
        const mayRemove = manages || mine.has(organization.id);
        return (
          <div key={organization.id}>
            <button
              type="button"
              onClick={() => {
                void navigate(`/events/organizations/${organization.id}`);
              }}
              className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 text-left"
            >
              <OrganizationBadge organization={organization} />
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
                  {organization.name}
                </span>
                <span className="block text-[0.78125rem] text-grey">
                  Co-host · {organizationTown(organization)}
                </span>
              </span>
              <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
            </button>
            {mayRemove ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void run(
                    () => leaveEventCohost(event.id, organization.id, alsoLater),
                    `${organization.name} is no longer a co-host.`,
                  );
                }}
                className="mt-1 min-h-11 px-1 font-bold text-[0.8125rem] text-emphasis disabled:opacity-50"
              >
                Remove {organization.name} as co-host
              </button>
            ) : null}
          </div>
        );
      })}

      {manages ? (
        <div className="rounded-[14px] border border-line border-dashed p-3.5">
          <label htmlFor={findId} className="block font-bold text-[0.8125rem] text-ink">
            Add a co-host
          </label>
          <input
            id={findId}
            type="search"
            autoComplete="off"
            value={find}
            disabled={busy}
            onChange={(e) => {
              setFind(e.target.value);
            }}
            placeholder="Name, short code or town"
            className="mt-1.5 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-emphasis"
          />
          {find.trim() === '' ? null : found.length === 0 ? (
            <p role="status" className="mt-1.5 text-[0.8125rem] text-grey">
              No organization matches that.
            </p>
          ) : (
            <ul
              aria-label="Organizations found"
              className="mt-1.5 rounded-[11px] border border-line py-1"
            >
              {found.map((organization) => (
                <li key={organization.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void run(
                        () =>
                          setEventCohosts(
                            event.id,
                            [...event.cohostIds, organization.id],
                            alsoLater,
                          ),
                        `${organization.name} is now a co-host.`,
                      );
                    }}
                    className="flex min-h-[44px] w-full items-center px-3 py-1.5 text-left text-[0.875rem] text-ink hover:bg-tint disabled:opacity-50"
                  >
                    {organization.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {repeats ? (
            <label className="mt-2.5 flex min-h-11 items-center gap-2 text-[0.8125rem] text-ink2">
              <input
                type="checkbox"
                checked={later}
                onChange={(e) => {
                  setLater(e.target.checked);
                }}
                className="h-[18px] w-[18px] accent-emphasis"
              />
              Later dates of this repeating event too
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
