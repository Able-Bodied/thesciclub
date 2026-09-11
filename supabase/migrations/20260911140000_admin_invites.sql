-- ============================================================================
-- Administering the list
-- ============================================================================
-- The club is invite-only, and until now the only way to put a number on the
-- list was the service role. That makes growth an engineering task, which is
-- the wrong shape: the people who decide who belongs are the organizations and
-- the administrators, not whoever has the secret key.
--
-- Four things, all gated on is_admin() in the database rather than in the UI:
-- read the list, add to it, revoke from it, and make somebody a mentor.
--
-- Revoking only ever applies to a *pending* invite. A consumed one belongs to a
-- member who has already joined; taking their membership away is
-- admin_set_member_status, and conflating the two would make "revoke" mean two
-- different things depending on timing.
-- ============================================================================

-- --------------------------------------------------------------- the roster
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
  i.seed_member_id
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
where public.is_admin();

revoke all on public.admin_invites from anon, public;
grant select on public.admin_invites to authenticated;

-- ------------------------------------------------------- unclaimed profiles
-- The seeded people nobody has joined as yet, so an administrator issuing an
-- invite can attach the right one. This is where name matching belongs: in
-- front of the person doing the vouching, not in front of the person signing
-- up, who could simply claim to be anybody.
drop view if exists public.admin_claimable_members;

create view public.admin_claimable_members as
select m.id, m.display_name, m.city, m.state, m.exact_level, m.level_range
from public.members m
where public.is_admin()
  and m.is_seed
  and not exists (
    select 1 from public.invites i
    where i.seed_member_id = m.id and i.status in ('pending', 'consumed')
  );

revoke all on public.admin_claimable_members from anon, public;
grant select on public.admin_claimable_members to authenticated;

-- ------------------------------------------------------------- the actions
create or replace function public.admin_create_invite(
  raw_phone text,
  organization uuid,
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

  if not exists (select 1 from public.organizations where id = organization and can_invite) then
    raise exception 'That organization cannot issue invites';
  end if;

  -- A claim may only ever point at a seeded profile. Without this an invite
  -- could be aimed at a real member, and consuming it would delete them.
  if claim_member is not null
     and not exists (select 1 from public.members where id = claim_member and is_seed) then
    raise exception 'That profile is not one of the seeded directory entries';
  end if;

  if public.has_active_invite(raw_phone) then
    raise exception 'That number is already on the list';
  end if;

  insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id, note)
  values (raw_phone, organization, claim_member, invite_note)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.admin_revoke_invite(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  select status into current_status from public.invites where id = target;
  if not found then
    raise exception 'No such invite';
  end if;
  if current_status = 'consumed' then
    raise exception 'That invite has already been used — remove the member instead';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now()
   where id = target;
end;
$$;

create or replace function public.admin_set_member_type(target uuid, new_type text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if new_type not in ('peer', 'mentor') then
    raise exception 'Unknown type: %', new_type;
  end if;

  update public.members set type = new_type where id = target;
  if not found then
    raise exception 'No such member';
  end if;
end;
$$;

revoke all on function public.admin_create_invite(text, uuid, uuid, text) from public, anon;
revoke all on function public.admin_revoke_invite(uuid) from public, anon;
revoke all on function public.admin_set_member_type(uuid, text) from public, anon;
grant execute on function public.admin_create_invite(text, uuid, uuid, text) to authenticated;
grant execute on function public.admin_revoke_invite(uuid) to authenticated;
grant execute on function public.admin_set_member_type(uuid, text) to authenticated;
