import { californiaToday, type Grant, grantDay, grantStatus } from '@/lib/grants';

/**
 * An organization's grants, under its description: each with its link, what
 * it pays for, and when to apply, worked out today (src/lib/grants.ts). While
 * one is open it is called out. Followers are told when one opens
 * (20261021010000), and the section says so.
 */
export function OrganizationGrants({
  grants,
  organizationName,
  following,
  today = californiaToday(),
}: {
  grants: Grant[];
  organizationName: string;
  following: boolean;
  today?: string;
}) {
  if (grants.length === 0) return null;
  const hasDates = grants.some((g) => g.windows.length > 0);

  return (
    <section aria-labelledby="grants-heading">
      <h2
        id="grants-heading"
        className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Grants
      </h2>
      <ul className="space-y-3">
        {grants.map((grant) => {
          const status = grantStatus(grant, today);
          return (
            <li key={grant.id} className="rounded-[12px] border border-line bg-paper px-3.5 py-3">
              <a
                href={grant.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[0.9375rem] text-emphasis underline decoration-1 underline-offset-2"
              >
                {grant.name}
              </a>
              {grant.summary ? (
                <p className="mt-1 text-[0.8375rem] text-ink2 leading-[1.5]">{grant.summary}</p>
              ) : null}
              {status.kind === 'open' ? (
                <p className="mt-2 rounded-r-[9px] border-gold border-l-[3px] bg-gold-lt px-3 py-2 font-semibold text-[0.8125rem] text-gold-ink">
                  Applications are open now, until {grantDay(status.closes, today)}.
                </p>
              ) : (
                <p className="mt-2 text-[0.8125rem] text-ink2">
                  {status.kind === 'upcoming'
                    ? `Applications open ${grantDay(status.opens, today)} to ${grantDay(status.closes, today)}.`
                    : status.kind === 'any_time'
                      ? 'Apply any time.'
                      : 'No dates for the next round yet. Check their site.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hasDates ? (
        <p className="mt-3 text-[0.8125rem] text-ink2 leading-[1.5]">
          {following
            ? `You’re a member of ${organizationName}, so we’ll notify you when applications open.`
            : `Join ${organizationName} and we’ll notify you when applications open.`}
        </p>
      ) : null}
    </section>
  );
}
