import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { useEvents } from '@/lib/events';
import { useOrganizationGrants } from '@/lib/grants';
import { useOrganizationFollows } from '@/lib/organization-follows';
import {
  fetchOrganizationMembers,
  JOINED_VIA_LABEL,
  type OrganizationMember,
  useMyDenial,
  useOrganizationChat,
  useOrganizationMemberCount,
} from '@/lib/organization-members';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { backLabel, backToEvents } from '@/routes/events/back';
import { FollowButton } from '@/routes/events/follow-button';
import { dateTileParts } from '@/routes/events/format';
import { OrganizationAddMembers } from '@/routes/events/organization-add-members';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { OrganizationGrants } from '@/routes/events/organization-grants';
import { organizationTown, placesOf } from '@/routes/events/organization-places';
import { OrganizationReviews } from '@/routes/events/organization-reviews';
import { EventDescription } from '@/routes/events/rich-text';

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
  const location = useLocation();
  const back = backToEvents(location);
  const { byId, loading } = useOrganizations();
  const follows = useOrganizationFollows();
  const { events } = useEvents({ organizationId: id ?? '00000000-0000-0000-0000-000000000000' });
  const { grants } = useOrganizationGrants(id);
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [additions, setAdditions] = useState(0);
  const count = useOrganizationMemberCount(id, additions);
  const denial = useMyDenial(id, memberId);
  const chat = useOrganizationChat(id, memberId);
  const mine = useMyOrganizations(memberId);
  const seesMembers =
    account.status === 'member' && (account.isAdmin || (id !== undefined && mine.ids.has(id)));
  const [roster, setRoster] = useState<OrganizationMember[] | null>(null);

  const readRoster = useCallback(() => {
    if (!id) return;
    void fetchOrganizationMembers(id).then((result) => {
      if (result.ok) setRoster(result.value);
    });
  }, [id]);
  const isMember = id !== undefined && follows.following.has(id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: joining or leaving changes the list.
  useEffect(readRoster, [readRoster, isMember]);

  const organization = id ? (byId.get(id) ?? null) : null;

  if (loading) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }
  if (!organization) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[0.875rem] text-ink2">No such organization.</p>
        <button
          type="button"
          onClick={() => {
            void navigate(back);
          }}
          className="mt-4 font-bold font-head text-[0.9375rem] text-emphasis"
        >
          Back to Events
        </button>
      </div>
    );
  }

  const now = new Date().toISOString();
  const upcoming = events
    .filter((event) => event.organizationId === organization.id && event.startTime >= now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-plate px-4 pt-[18px] pb-5 text-white">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          <button
            type="button"
            onClick={() => {
              void navigate(back);
            }}
            className="block pb-3 text-[#B9CADF] text-[0.875rem]"
          >
            ← {backLabel(location)}
          </button>

          <div className="flex items-center gap-[13px]">
            <OrganizationBadge organization={organization} size="lg" />
            <span>
              <span className="block font-extrabold font-head text-[1.3125rem] leading-[1.2] tracking-[-0.01em]">
                {organization.name}
              </span>
              <span className="mt-[3px] block text-[#B9CADF] text-[0.8125rem]">
                {[
                  organizationTown(organization),
                  placesOf(organization).length > 1
                    ? `${placesOf(organization).length} locations`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </div>

          {/* Under the name rather than beside it. At 430px a button on the
              same row as a 21px organization name leaves the name about nine
              characters, and "Christopher & Dana Reeve Foundation" is one of
              six rows here. */}
          {denial === null ? (
            <FollowButton
              onNavy
              following={follows.following.has(organization.id)}
              onToggle={() => {
                follows.toggle(organization.id);
              }}
              className="mt-3"
            />
          ) : null}

          {count !== null ? (
            <p className="mt-2.5 text-[#DDE7F3] text-[0.8125rem]">
              <b className="text-white">{count}</b> {count === 1 ? 'member' : 'members'}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {organization.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-plate-chip px-2.5 py-[5px] font-semibold text-[#DDE7F3] text-[0.7375rem]"
              >
                {tag}
              </span>
            ))}
            {organization.canInvite ? (
              <span className="rounded-full bg-[#3A2F12] px-2.5 py-[5px] font-semibold text-gold-hi text-[0.7375rem]">
                Can issue invites
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pb-5">
        {/* The small Markdown events use: paragraphs, bold, lists, links. */}
        <EventDescription
          html=""
          text={organization.description}
          className="mt-2.5 text-[0.8875rem] text-ink leading-[1.52] [&_a]:font-semibold [&_a]:text-emphasis [&_a]:underline [&_a]:[overflow-wrap:anywhere] [&_li]:ml-5 [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_p:first-child]:mt-0 [&_p]:mt-2.5 [&_strong]:font-bold [&_ul]:mt-2 [&_ul]:list-disc"
        />

        <OrganizationGrants
          grants={grants}
          organizationName={organization.name}
          following={follows.following.has(organization.id)}
        />

        {upcoming.length > 0 ? (
          <>
            <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
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
                    <span className="block font-extrabold font-head text-[1.1875rem] text-emphasis leading-[1.15]">
                      {tile.day}
                    </span>
                    <span className="block font-extrabold text-[0.625rem] text-ink2 tracking-[0.09em]">
                      {tile.mon}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold font-head text-[0.90625rem] text-ink leading-[1.25]">
                      {event.title}
                    </span>
                    <span className="block text-[0.78125rem] text-grey">
                      {[event.city, event.city ? event.state : null].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
                </button>
              );
            })}
          </>
        ) : null}

        {denial !== null ? (
          <div role="status" className="mt-4 rounded-[14px] border border-line bg-paper p-3.5">
            <p className="font-bold text-[0.9375rem] text-ink">
              {organization.name} declined your membership
            </p>
            <p className="mt-1 text-[0.875rem] text-ink2 leading-[1.5]">{denial}</p>
          </div>
        ) : null}

        {chat ? (
          <Link
            to={`/chat/t/${chat}`}
            className="mt-4 flex min-h-[46px] items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
          >
            Members' group chat
          </Link>
        ) : null}

        {seesMembers ? (
          <OrganizationReviews organizationId={organization.id} onChanged={readRoster} />
        ) : null}

        {roster && roster.length > 0 ? (
          <>
            <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
              Members
            </h2>
            <ul className="rounded-[14px] border border-line bg-paper px-3.5">
              {roster.map((member) => (
                <li key={member.id} className="border-line border-b last:border-b-0">
                  <Link to={`/peers/${member.id}`} className="flex items-center gap-2.5 py-2.5">
                    <MemberAvatar
                      id={member.id}
                      displayName={member.displayName}
                      photoPath={member.photoPath}
                      photoAlt={member.photoAlt}
                    />
                    <span className="min-w-0">
                      <span className="block font-bold text-[0.9375rem] text-ink">
                        {member.displayName}
                      </span>
                      {member.joinedVia ? (
                        <span className="block text-[0.78125rem] text-grey">
                          {JOINED_VIA_LABEL[member.joinedVia]}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {seesMembers ? (
          <OrganizationAddMembers
            organizationId={organization.id}
            exclude={new Set(roster?.map((member) => member.id))}
            onAdded={() => {
              readRoster();
              setAdditions((n) => n + 1);
            }}
          />
        ) : null}

        {organization.canInvite ? (
          <p className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-gold-ink text-[0.7875rem] leading-[1.5]">
            {organization.name} can invite people to the club by email.
          </p>
        ) : null}
      </div>
    </div>
  );
}
