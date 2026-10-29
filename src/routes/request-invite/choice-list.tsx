import type { InviteRequestChoice } from '@/lib/invite-requests';
import { OrganizationBadge } from '@/routes/events/organization-badge';

type Admin = InviteRequestChoice['admins'][number];

/**
 * The organizations that can invite, each with its org admins by first name
 * as buttons (the owner, 2026-10-28). On /request-invite and on the blocked
 * screen, where a tap goes on to the request form.
 */
export function InviteChoiceList({
  choices,
  isOn = () => false,
  onPick,
}: {
  choices: InviteRequestChoice[];
  isOn?: (organization: InviteRequestChoice, admin: Admin) => boolean;
  onPick: (organization: InviteRequestChoice, admin: Admin) => void;
}) {
  return (
    <ul className="mt-4 rounded-[17px] border border-line bg-paper px-3.5">
      {choices.map((organization) => (
        <li
          key={organization.organizationId}
          className="flex gap-3 border-line border-b py-3.5 last:border-b-0"
        >
          <OrganizationBadge organization={organization} />
          <div className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.875rem] text-ink">
              {organization.name}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {organization.admins.map((admin) => {
                const on = isOn(organization, admin);
                return (
                  <button
                    key={admin.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Ask ${admin.firstName} from ${organization.name}`}
                    onClick={() => {
                      onPick(organization, admin);
                    }}
                    className={`rounded-full border-[1.4px] px-3 py-1.5 font-bold font-head text-[0.8125rem] ${
                      on
                        ? 'border-emphasis bg-emphasis text-white'
                        : 'border-line bg-canvas text-emphasis'
                    }`}
                  >
                    {admin.firstName}
                  </button>
                );
              })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
