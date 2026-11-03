import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { fetchOrganizationPeople, type OrganizationPerson, roleOf } from '@/lib/event-notices';
import { grantMentor, removeOrganizationPerson, revokeMentor } from '@/lib/organization-mentors';
import { ItemActions } from '@/routes/chat/item-actions';

/** How many show before See all (the owner, 2026-11-02). */
export const FIRST_PEOPLE = 10;

/**
 * Everyone in the organization, for its org admins (20261103000000): org
 * admins, mentors and members, one compact line each. A ••• on each but the
 * org admins makes or stops a mentor, or removes them (the owner, 2026-11-03).
 */
export function OrganizationPeople({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [people, setPeople] = useState<OrganizationPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(
    (isLive: () => boolean = () => true) => {
      void fetchOrganizationPeople(organizationId).then((result) => {
        if (!isLive()) return;
        if (result.ok) setPeople(result.value);
        else setError(result.error);
      });
    },
    [organizationId],
  );

  useEffect(() => {
    let live = true;
    setPeople(null);
    setError(null);
    setAll(false);
    load(() => live);
    return () => {
      live = false;
    };
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="mt-4 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (people === null) return null;

  const mentors = people.filter((p) => !p.isOrgAdmin && p.isMentor).length;
  const admins = people.filter((p) => p.isOrgAdmin).length;
  const shown = all ? people : people.slice(0, FIRST_PEOPLE);

  return (
    <div className="mt-4">
      <h3 className="font-extrabold font-head text-[0.875rem] text-ink">People</h3>
      <p className="mt-0.5 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        {people.length === 1 ? '1 person' : `${String(people.length)} people`} ·{' '}
        {admins === 1 ? '1 org admin' : `${String(admins)} org admins`} ·{' '}
        {mentors === 1 ? '1 mentor' : `${String(mentors)} mentors`}
      </p>
      {people.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-paper px-3.5 py-4 text-center text-[0.875rem] text-grey">
          Nobody yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {shown.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              organizationId={organizationId}
              organizationName={organizationName}
              onChanged={() => {
                load();
              }}
            />
          ))}
        </ul>
      )}
      {people.length > FIRST_PEOPLE ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => {
            setAll(!all);
          }}
          className="mt-2 min-h-[44px] font-semibold text-[0.875rem] text-emphasis underline"
        >
          {all ? 'Show fewer' : `See all ${String(people.length)}`}
        </button>
      ) : null}
    </div>
  );
}

function PersonRow({
  person,
  organizationId,
  organizationName,
  onChanged,
}: {
  person: OrganizationPerson;
  organizationId: string;
  organizationName: string;
  onChanged: () => void;
}) {
  const account = useAccount();
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Org admins are an administrator's to change, and nobody removes themself.
  const actionable = !person.isOrgAdmin && account.userId !== person.id;

  function done(result: { ok: boolean; error?: string }, said: string) {
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error ?? 'That did not work.');
      return;
    }
    setConfirming(false);
    announce(said);
    onChanged();
  }

  function toggleMentor() {
    setFailure(null);
    setBusy(true);
    void (person.isMentor ? revokeMentor : grantMentor)(organizationId, person.id).then(
      (result) => {
        done(
          result,
          person.isMentor
            ? `${person.name} is no longer a mentor of ${organizationName}.`
            : `${person.name} is now a mentor of ${organizationName}.`,
        );
      },
    );
  }

  function remove() {
    setFailure(null);
    setBusy(true);
    void removeOrganizationPerson(organizationId, person.id).then((result) => {
      done(result, `${person.name} was removed from ${organizationName}.`);
    });
  }

  return (
    <li className="border-line border-b last:border-b-0">
      <div className="flex items-center">
        <Link
          to={`/peers/${person.id}`}
          state={{ from: 'stats' }}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-tint"
        >
          <span aria-hidden="true">
            <MemberAvatar id={person.id} displayName={person.name} photoPath={person.photoPath} />
          </span>
          <span className="min-w-0 flex-1 break-words font-semibold text-[0.875rem] text-ink">
            {person.name}
          </span>
          <span className="flex-none text-[0.75rem] text-grey">{roleOf(person)}</span>
        </Link>
        {actionable ? (
          <ItemActions
            what={person.name}
            title={person.name}
            buttonClassName="text-grey hover:bg-tint mr-1"
          >
            <button type="button" disabled={busy} onClick={toggleMentor}>
              {person.isMentor ? 'Remove as mentor' : 'Make mentor'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFailure(null);
                setConfirming(true);
              }}
            >
              Remove from {organizationName}
            </button>
          </ItemActions>
        ) : (
          <span aria-hidden="true" className="w-1" />
        )}
      </div>
      {confirming ? (
        <div className="mx-3 mb-2.5 rounded-[12px] bg-tint px-3 py-2.5">
          <p className="text-[0.8125rem] text-ink leading-[1.45]">
            Remove {person.name} from {organizationName}?{' '}
            {person.isMentor ? 'They stop being its mentor, and leave' : 'They leave'} its group
            chat. They are not told.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="min-h-[44px] rounded-[10px] bg-paper px-3 font-semibold text-[0.8125rem] text-emphasis"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="min-h-[44px] rounded-[10px] bg-destructive-fill px-3 font-semibold text-[0.8125rem] text-white disabled:opacity-50"
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="mx-3 mb-2 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}
    </li>
  );
}
