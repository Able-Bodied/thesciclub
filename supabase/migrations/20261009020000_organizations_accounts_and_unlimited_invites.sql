-- Owner, 2026-10-09: administrators manage organizations and designate their
-- accounts. Organization accounts and linked representatives invite without a
-- cap. Organization powers are scoped by links; they never grant club admin.
alter table public.members drop constraint members_type_check;
alter table public.members add constraint members_type_check
  check (type in ('peer', 'mentor', 'organization'));

create or replace function public.admin_set_member_type(target uuid, new_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if new_type not in ('peer', 'mentor', 'organization') or new_type is null then
    raise exception 'Choose member, mentor or organization.';
  end if;
  if not exists (select 1 from public.members where id = target) then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.members where id = target and is_admin) then
    raise exception 'An administrator is a mentor and cannot be made a peer';
  end if;
  update public.members set type = new_type where id = target;
end;
$$;
revoke all on function public.admin_set_member_type(uuid, text) from public, anon;
grant execute on function public.admin_set_member_type(uuid, text) to authenticated;

-- Removing a directory entry preserves the host and inviter in historical
-- events and memberships. Links are removed, so no representative keeps power.
alter table public.organizations add column removed_at timestamptz;
grant select (removed_at) on public.organizations to authenticated;

create or replace function public.speaks_for(organization uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.organization_representatives r
    join public.members m on m.id = r.member_id and m.status = 'active'
    join public.organizations o on o.id = r.organization_id and o.removed_at is null
    where r.organization_id = organization and r.member_id = auth.uid()
  );
$$;

create or replace function public.my_organizations()
returns setof uuid language sql security definer stable set search_path = '' as $$
  select r.organization_id from public.organization_representatives r
  join public.members m on m.id = r.member_id and m.status = 'active'
  join public.organizations o on o.id = r.organization_id and o.removed_at is null
  where r.member_id = auth.uid();
$$;

create or replace function public.save_organization(
  organization uuid, short_code text, name text, city text,
  description text, tags text[], can_invite boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved uuid;
  previous_invite boolean;
  administrator boolean := public.is_admin();
begin
  if organization is null then
    if not administrator then
      raise exception 'Only an administrator can add an organization.' using errcode = '42501';
    end if;
  else
    -- Lock the entry before deciding permission, including removal races.
    select o.can_invite into previous_invite from public.organizations o
      where o.id = organization and o.removed_at is null for update;
    if not found then
      raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
    end if;
    if not administrator and not (
      public.speaks_for(organization) and exists (
        select 1 from public.members where id = auth.uid() and type = 'organization' and status = 'active'
      )
    ) then
      raise exception 'You cannot change this organization.' using errcode = '42501';
    end if;
    if not administrator and can_invite is distinct from previous_invite then
      raise exception 'Only an administrator can change whether an organization vouches for members.' using errcode = '42501';
    end if;
  end if;
  if name is null or length(trim(name)) not between 1 and 300
    or city is null or length(trim(city)) not between 1 and 160
    or short_code is null or upper(trim(short_code)) !~ '^[A-Z]{2,4}$'
    or description is null or length(description) > 4000
    or tags is null or cardinality(tags) > 12
    or exists (select 1 from unnest(tags) tag where tag is null or length(trim(tag)) not between 1 and 80)
    or can_invite is null then
    raise exception 'Enter a name, place, two to four letter short code, and up to twelve tags.';
  end if;
  if organization is null then
    insert into public.organizations (short_code, name, city, description, tags, can_invite)
    values (upper(trim(short_code)), trim(name), trim(city), trim(description), tags, can_invite)
    returning id into saved;
  else
    update public.organizations o set short_code = upper(trim(save_organization.short_code)),
      name = trim(save_organization.name), city = trim(save_organization.city),
      description = trim(save_organization.description), tags = save_organization.tags,
      can_invite = save_organization.can_invite where o.id = organization returning o.id into saved;
  end if;
  return saved;
end;
$$;

create or replace function public.admin_remove_organization(organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  update public.organizations set removed_at = clock_timestamp(), can_invite = false
    where id = organization and removed_at is null;
  if not found then
    raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
  end if;
  delete from public.organization_representatives where organization_id = organization;
end;
$$;

-- Active accounts only, regardless of which screen issues the invite.
create or replace function public.my_invite_permissions()
returns table (can_invite boolean, unlimited boolean)
language sql security definer stable set search_path = '' as $$
  select coalesce(bool_or(m.type = 'mentor' or m.type = 'organization' or m.is_admin or r.linked), false),
    coalesce(bool_or(m.type = 'organization' or m.is_admin or r.linked), false)
  from public.members m
  cross join lateral (select exists (
    select 1 from public.organization_representatives rep
    join public.organizations o on o.id = rep.organization_id and o.removed_at is null
    where rep.member_id = m.id
  ) as linked) r
  where m.id = auth.uid() and m.status = 'active';
$$;

revoke all on function public.save_organization(uuid, text, text, text, text, text[], boolean) from public, anon;
revoke all on function public.admin_remove_organization(uuid) from public, anon;
revoke all on function public.my_invite_permissions() from public, anon;
grant execute on function public.save_organization(uuid, text, text, text, text, text[], boolean) to authenticated;
grant execute on function public.admin_remove_organization(uuid) to authenticated;
grant execute on function public.my_invite_permissions() to authenticated;

-- Replace rather than add an ORed policy. The ownership and claim guards
-- apply to unlimited accounts too. An ordinary mentor still has ten slots.
drop policy if exists "mentors can invite within their allowance" on public.invites;
create policy "members can invite within their allowance" on public.invites for insert
  with check (
    invited_by_member_id = auth.uid()
    and invited_by_organization_id is null and seed_member_id is null
    and status = 'pending' and consumed_at is null and revoked_at is null
    and exists (
      select 1 from public.my_invite_permissions() p where p.can_invite
      and (p.unlimited or public.live_invite_count(auth.uid()) < public.mentor_invite_limit())
    )
  );

-- Keep linking protected, and reject an entry removed from the directory.
create or replace function public.admin_add_representative(organization uuid, member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  perform 1 from public.organizations o where o.id = organization and o.removed_at is null for update;
  if not found then
    raise exception 'That organization is not in the directory.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.members m where m.id = member and m.status = 'active' and not m.is_seed) then
    raise exception 'Only a member who has joined and is active can speak for an organization.' using errcode = 'P0002';
  end if;
  insert into public.organization_representatives (organization_id, member_id, added_by)
    values (organization, member, auth.uid()) on conflict (organization_id, member_id) do nothing;
end;
$$;
notify pgrst, 'reload schema';

-- The roster must not label linked mentors as capped at ten either.
create or replace view public.admin_members with (security_barrier = true) as
select m.id, m.display_name, m.phone, m.type, m.status, m.is_admin, m.is_seed,
  m.city, m.state, m.level_range, m.exact_level, m.show_in_browse,
  m.created_at, m.updated_at, public.live_invite_count(m.id) as invites_used,
  public.active_strike_count(m.id) as strikes,
  (m.is_admin or m.type = 'organization' or exists (
    select 1 from public.organization_representatives r
    join public.organizations o on o.id = r.organization_id and o.removed_at is null
    where r.member_id = m.id
  )) as unlimited_invites
from public.members m where public.is_admin();
revoke all on public.admin_members from public, anon, authenticated;
grant select on public.admin_members to authenticated;
