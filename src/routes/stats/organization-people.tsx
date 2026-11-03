import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { fetchOrganizationPeople, type OrganizationPerson, roleOf } from '@/lib/event-notices';

/** How many show before See all (the owner, 2026-11-02). */
export const FIRST_PEOPLE = 10;

/**
 * Everyone in the organization, for its org admins (20261103000000): org
 * admins, mentors and members, one compact line each.
 */
export function OrganizationPeople({ organizationId }: { organizationId: string }) {
  const [people, setPeople] = useState<OrganizationPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setPeople(null);
    setError(null);
    setAll(false);
    void fetchOrganizationPeople(organizationId).then((result) => {
      if (!live) return;
      if (result.ok) setPeople(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [organizationId]);

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
            <li key={person.id} className="border-line border-b last:border-b-0">
              <Link
                to={`/peers/${person.id}`}
                state={{ from: 'stats' }}
                className="flex min-h-[44px] items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-tint"
              >
                <span aria-hidden="true">
                  <MemberAvatar
                    id={person.id}
                    displayName={person.name}
                    photoPath={person.photoPath}
                  />
                </span>
                <span className="min-w-0 flex-1 break-words font-semibold text-[0.875rem] text-ink">
                  {person.name}
                </span>
                <span className="flex-none text-[0.75rem] text-grey">{roleOf(person)}</span>
              </Link>
            </li>
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
