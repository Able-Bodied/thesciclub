-- ============================================================================
-- An administrator can put a number on the list in their own name
-- ============================================================================
-- `admin_create_invite` has always required an organization, and refused any
-- that cannot invite. That fits the club's model — an organization vouches
-- for you — but it leaves the administrator unable to say the true thing
-- about a number they are adding themselves: the launch allowlist, somebody
-- met at an event, a member's partner. Attributing those to NorCal SCI is a
-- small lie told in the record of who vouched for whom, which is the one
-- record this table exists to keep.
--
-- So `organization` becomes optional, and an invite with none is attributed
-- to the administrator's own member row — `invited_by_member_id = auth.uid()`.
-- The same column a mentor's invite uses, and the same constraint governs
-- both: exactly one inviter, never two.
--
-- ---------------------------------------------------------------------------
-- A claim still needs an organization
-- ---------------------------------------------------------------------------
-- 20260910130000 is explicit that only an organization may point an invite at
-- a seeded profile: the directory came from one, and a claim is an assertion
-- that this number belongs to that person. That rule is not loosened here,
-- and the refusal says so rather than silently dropping the claim. In
-- practice it costs nothing — the seeded rows came from NorCal SCI, so a
-- claim attributed to NorCal SCI is also the accurate answer.
--
-- ---------------------------------------------------------------------------
-- Telling the two kinds of member inviter apart
-- ---------------------------------------------------------------------------
-- `admin_invites.invited_by_member` has until now meant "a mentor", because a
-- mentor's own policy was the only way a member's id got into that column,
-- and `/admin` labels it "(mentor)". After this it can also mean "an
-- administrator", so the view reports which, and the label follows. Getting
-- that wrong would describe the club's own administrator as a mentor on every
-- number they added.
-- ============================================================================

create or replace function public.admin_create_invite(
  raw_phone text,
  organization uuid default null,
  claim_member uuid default null,
  invite_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  if length(public.normalize_phone(raw_phone)) < 11 then
    raise exception 'That does not look like a full US phone number';
  end if;

  if organization is not null
     and not exists (select 1 from public.organizations where id = organization and can_invite) then
    raise exception 'That organization cannot issue invites';
  end if;

  -- A claim may only ever point at a seeded profile. Without this an invite
  -- could be aimed at a real member, and consuming it would delete them.
  if claim_member is not null
     and not exists (select 1 from public.members where id = claim_member and is_seed) then
    raise exception 'That profile is not one of the seeded directory entries';
  end if;

  -- And only an organization may make that assertion — see the header, and
  -- 20260910130000 for why identity claims come from the body that compiled
  -- the directory rather than from an individual.
  if claim_member is not null and organization is null then
    raise exception 'A directory claim has to be vouched for by an organization';
  end if;

  if public.has_active_invite(raw_phone) then
    raise exception 'That number is already on the list';
  end if;

  insert into public.invites (
    phone_raw, invited_by_organization_id, invited_by_member_id, seed_member_id, note
  )
  values (
    raw_phone,
    organization,
    -- Exactly one inviter: the administrator only when no organization was
    -- named, which invites_one_inviter enforces independently of this.
    case when organization is null then auth.uid() end,
    claim_member,
    invite_note
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- --------------------------------------------------------------------- view
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
  -- Which kind of member vouched. Until this migration the answer was always
  -- "a mentor"; it can now also be the club's own administrator.
  inviter.is_admin as invited_by_member_is_admin,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  (u.id is not null) as has_account,
  u.created_at as account_created_at
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join public.members holder on holder.phone = i.phone
left join auth.users u on u.phone = i.phone
where public.is_admin();

revoke all on public.admin_invites from anon, public;
grant select on public.admin_invites to authenticated;
