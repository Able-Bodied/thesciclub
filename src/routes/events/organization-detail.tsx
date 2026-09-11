import { ChevronRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEvents } from '@/lib/events';
import { useBrowseMembers } from '@/lib/members';
import { useOrganizations } from '@/lib/organizations';
import { photoUrlFor } from '@/lib/photos';
import { dateTileParts } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { gradientFor, initialsOf } from '@/routes/peers/member-card';

/**
 * One organization, from `orgPage()` in the mock: who they are, the members who
 * name them, and what they have coming up.
 *
 * Public in the schema but reached from inside the shell here, so the member
 * list is a normal read of `browse_members`. If this page is ever also served
 * to somebody with no account, that section is the part that has to go — the
 * events and the description are already public, the people are not.
 */
export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { byId, loading } = useOrganizations();
  const { events } = useEvents();
  const { members } = useBrowseMembers();

  const organization = id ? (byId.get(id) ?? null) : null;

  if (loading) {
    return <p className="px-6 py-10 text-center text-[14px] text-grey">Loading…</p>;
  }
  if (!organization) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[14px] text-ink2">No such organization.</p>
        <button
          type="button"
          onClick={() => {
            void navigate('/events');
          }}
          className="mt-4 font-bold font-head text-[15px] text-navy"
        >
          Back to Events
        </button>
      </div>
    );
  }

  // Members name their affiliations as free text matched against the
  // organization's name, which is why `organizations.name` is unique.
  const affiliated = members.filter((member) => member.affiliations.includes(organization.name));

  const now = new Date().toISOString();
  const upcoming = events
    .filter((event) => event.organizationId === organization.id && event.startTime >= now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-navy px-4 pt-[18px] pb-5 text-white">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          <button
            type="button"
            onClick={() => {
              void navigate('/events');
            }}
            className="block pb-3 text-[#B9CADF] text-[14px]"
          >
            ← Back
          </button>

          <div className="flex items-center gap-[13px]">
            <OrganizationBadge organization={organization} size="lg" />
            <span>
              <span className="block font-extrabold font-head text-[21px] leading-[1.2] tracking-[-0.02em]">
                {organization.name}
              </span>
              <span className="mt-[3px] block text-[#B9CADF] text-[13px]">{organization.city}</span>
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {organization.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#22406B] px-2.5 py-[5px] font-semibold text-[#DDE7F3] text-[11.8px]"
              >
                {tag}
              </span>
            ))}
            {organization.canInvite ? (
              <span className="rounded-full bg-[#3A2F12] px-2.5 py-[5px] font-semibold text-[#EBD277] text-[11.8px]">
                Can issue invites
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pb-5">
        {organization.description ? (
          <p className="mt-2.5 text-[14.2px] text-ink leading-[1.52]">{organization.description}</p>
        ) : null}

        {upcoming.length > 0 ? (
          <>
            <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
              Upcoming
            </h2>
            {upcoming.map((event) => {
              const tile = dateTileParts(event.startTime, event.timezone);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    void navigate(`/events/${event.id}`);
                  }}
                  className="mb-[11px] flex w-full items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 text-left"
                >
                  <span className="block w-[46px] flex-none rounded-[12px] bg-tint py-1.5 text-center">
                    <span className="block font-extrabold font-head text-[19px] text-navy leading-[1.15]">
                      {tile.day}
                    </span>
                    <span className="block font-extrabold text-[10px] text-ink2 tracking-[0.09em]">
                      {tile.mon}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold font-head text-[14.5px] text-ink leading-[1.25]">
                      {event.title}
                    </span>
                    <span className="block text-[12.5px] text-grey">{event.city}</span>
                  </span>
                  <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
                </button>
              );
            })}
          </>
        ) : null}

        {affiliated.length > 0 ? (
          <>
            <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
              Members here
            </h2>
            {affiliated.map((member) => {
              const [from, to] = gradientFor(member.id);
              const photo = photoUrlFor(member.photoPath);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    void navigate(`/peers/${member.id}`);
                  }}
                  className="flex w-full items-center gap-3 border-line border-b py-[13px] text-left last:border-b-0"
                >
                  <span
                    className="relative grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-[11px] font-extrabold font-head text-[13px] text-white"
                    style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
                  >
                    {photo ? (
                      <img
                        src={photo}
                        alt={member.photoAlt ?? ''}
                        className="absolute inset-0 h-full w-full object-cover object-[50%_32%]"
                      />
                    ) : (
                      initialsOf(member.displayName)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold font-head text-[14.5px] text-ink">
                      {member.displayName}
                    </span>
                    <span className="block text-[12.5px] text-grey">
                      {[member.exactLevel ?? member.levelRange, member.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
                </button>
              );
            })}
          </>
        ) : null}

        {organization.canInvite ? (
          <p className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[12.6px] leading-[1.5]">
            {organization.name} can put a phone number on the club's list. Membership is granted by
            a person, never claimed by a form.
          </p>
        ) : null}
      </div>
    </div>
  );
}
