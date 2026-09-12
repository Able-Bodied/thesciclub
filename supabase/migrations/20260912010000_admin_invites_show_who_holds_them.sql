-- ============================================================================
-- The list says who actually holds each invite
-- ============================================================================
-- `/admin` printed the invite's status verbatim: "pending", "consumed",
-- "revoked". Two problems with that, noticed on a real row.
--
-- The first is that a consumed invite whose member has since been deleted still
-- reads "consumed" — which says somebody used this and is in the club, when
-- nobody is. That state is rarer now that deletion revokes
-- (20260912000000_free_the_number_when_a_member_is_deleted.sql), but it exists
-- in the hosted data already and the view should be able to describe it rather
-- than assert something untrue.
--
-- The second is that "consumed" is a word from the schema, not a word anybody
-- says. The list is read by whoever decides who belongs in the club, and it can
-- afford to be in English.
--
-- So the view gains the member who holds the number. Joined on `phone` rather
-- than on `invite_id`: the phone is the club's identity — `members.phone` is
-- unique and it is what the auth gate verifies — and a member who rejoined
-- after a deletion has `invite_id` null, so an id join would report them as
-- missing when they are sitting right there.
-- ============================================================================

drop view if exists public.admin_invites;

create view public.admin_invites as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join public.members holder on holder.phone = i.phone
where public.is_admin();

revoke all on public.admin_invites from anon, public;
grant select on public.admin_invites to authenticated;
