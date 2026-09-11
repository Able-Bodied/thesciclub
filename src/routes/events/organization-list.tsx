import type { Organization } from '@/types/domain';

/**
 * The organizations directory, from `orgList()` in the mock.
 *
 * It lives under the Events tab rather than in a tab of its own because that is
 * where the mock puts it, and the reason holds: an organization is mostly
 * interesting here as the thing running what you are looking at.
 *
 * The note at the bottom is not decoration. docs/CONTEXT.md asks that how
 * somebody gets into the club stays visible in the product rather than buried
 * in a terms page, and this is the screen where the answer is in front of them.
 */
export function OrganizationList({
  organizations,
  onOpen,
}: {
  organizations: Organization[];
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {organizations.map((organization) => (
        <button
          key={organization.id}
          type="button"
          onClick={() => {
            onOpen(organization.id);
          }}
          className="mb-[11px] block w-full rounded-[17px] border border-line bg-paper p-3.5 text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className="grid h-[52px] w-[52px] flex-none place-items-center rounded-[16px] font-extrabold font-head text-[14px] text-white"
              style={{ background: 'linear-gradient(140deg,#8A6712,#C9A227)' }}
            >
              {organization.shortCode}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold font-head text-[16.5px] text-ink leading-[1.2] tracking-[-0.01em]">
                {organization.name}
              </span>
              <span className="mt-[3px] block text-[13px] text-ink2 leading-[1.42]">
                {organization.city}
              </span>
            </span>
          </div>
          {organization.canInvite ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[11.8px] text-gold-dp leading-[1.25]">
                Can issue invites
              </span>
            </div>
          ) : null}
        </button>
      ))}
      <p className="mt-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[12.6px] text-[#5C4409] leading-[1.5]">
        Organizations are one of the two ways a new member gets in. The other is a mentor.
      </p>
    </>
  );
}
