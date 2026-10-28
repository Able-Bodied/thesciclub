-- ============================================================================
-- A mentor is an organization's
-- ============================================================================
-- The owner, 2026-10-28: not all mentors are the same. A member is a mentor
-- of the organization that made them one, and is badged with its logo. An
-- organization's admins (organization_representatives, "Org admin" in the
-- app) make mentors of that organization; club administrators may for any.
-- Making org admins stays with club administrators.
--
-- members.type stays the one switch everything else reads (invites, the
-- Mentors list, ranking): 'mentor' while a member has a mentor organization,
-- or is an administrator; back to 'peer' when the last one is taken away. An
-- organization account keeps its type either way.
--
-- The SCI Club becomes an organization of its own (is_the_club), so the
-- club's mentors and administrators are badged like everybody else's:
-- today's mentors become its mentors, and its administrators its org admins.
-- CONTEXT.md had mentor badging deferred; the owner asked for it.
-- ============================================================================

alter table public.organizations
  add column if not exists is_the_club boolean not null default false;

create unique index if not exists organizations_the_club_idx
  on public.organizations (is_the_club) where is_the_club;

comment on column public.organizations.is_the_club is
  'The SCI Club itself: whose mentors an administrator makes from Admin. See 20261028000000.';

-- The club, unless an administrator already added it by name.
do $$
declare
  code text;
begin
  if exists (select 1 from public.organizations where is_the_club) then
    return;
  end if;
  update public.organizations set is_the_club = true
   where lower(name) in ('the sci club', 'thesciclub', 'sci club')
     and removed_at is null
     and id = (select id from public.organizations
                where lower(name) in ('the sci club', 'thesciclub', 'sci club') and removed_at is null
                order by created_at limit 1);
  if found then
    return;
  end if;
  select c into code
    from unnest(array['TSC', 'SCIC', 'TSCC', 'SCLB']) as c
   where not exists (select 1 from public.organizations o where o.short_code = c)
   limit 1;
  insert into public.organizations (short_code, name, city, description, is_the_club)
  values (code, 'The SCI Club', '', 'The club itself: its mentors and its administrators.', true);
end;
$$;

-- ------------------------------------------------------------- the mentors --
create table if not exists public.organization_mentors (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  granted_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, member_id)
);

create index if not exists organization_mentors_member_idx
  on public.organization_mentors (member_id);

comment on table public.organization_mentors is
  'Which organization made a member a mentor. Read through browse_members; written by grant_mentor and revoke_mentor. See 20261028000000.';

alter table public.organization_mentors enable row level security;
revoke all on public.organization_mentors from public, anon, authenticated;
grant select, insert, update, delete on public.organization_mentors to service_role;

-- Today's mentors are the club's, and its administrators its org admins.
insert into public.organization_mentors (organization_id, member_id)
select o.id, m.id
  from public.members m
 cross join public.organizations o
 where o.is_the_club and m.type = 'mentor' and not m.is_seed
on conflict do nothing;

insert into public.organization_representatives (organization_id, member_id)
select o.id, m.id
  from public.members m
 cross join public.organizations o
 where o.is_the_club and m.is_admin and not m.is_seed
on conflict do nothing;

-- ------------------------------------------------------------ who may grant --
-- A club administrator for any organization; an org admin for their own.
create or replace function public.may_make_mentors_for(organization uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin() or public.speaks_for(organization);
$$;

revoke all on function public.may_make_mentors_for(uuid) from public, anon;
grant execute on function public.may_make_mentors_for(uuid) to authenticated;

-- A peer becomes a mentor; nobody else's type changes.
create or replace function private.sync_mentor_type(target uuid)
returns void
language sql
set search_path = ''
as $$
  update public.members m
     set type = case
       when exists (select 1 from public.organization_mentors g where g.member_id = m.id)
         then 'mentor'
       else 'peer' end
   where m.id = target
     and m.type in ('peer', 'mentor')
     and not m.is_admin;
$$;

revoke all on function private.sync_mentor_type(uuid) from public, anon, authenticated;

create or replace function public.grant_mentor(organization uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.may_make_mentors_for(organization) then
    raise exception 'Only that organization''s admins can make its mentors.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations o where o.id = organization and o.removed_at is null) then
    raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.members m where m.id = member and m.status = 'active' and not m.is_seed
  ) then
    raise exception 'Only an active member can be made a mentor.' using errcode = 'P0002';
  end if;
  insert into public.organization_mentors (organization_id, member_id, granted_by)
  values (organization, member, auth.uid())
  on conflict do nothing;
  perform private.sync_mentor_type(member);
end;
$$;

revoke all on function public.grant_mentor(uuid, uuid) from public, anon;
grant execute on function public.grant_mentor(uuid, uuid) to authenticated;

create or replace function public.revoke_mentor(organization uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.may_make_mentors_for(organization) then
    raise exception 'Only that organization''s admins can change its mentors.' using errcode = '42501';
  end if;
  delete from public.organization_mentors g
   where g.organization_id = organization and g.member_id = member;
  perform private.sync_mentor_type(member);
end;
$$;

revoke all on function public.revoke_mentor(uuid, uuid) from public, anon;
grant execute on function public.revoke_mentor(uuid, uuid) to authenticated;

-- Admin's Make mentor and Make peer: the club's mentor, or no mentor at all.
-- An organization account is set as before.
create or replace function public.admin_set_member_type(target uuid, new_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
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
  if new_type = 'peer' then
    delete from public.organization_mentors where member_id = target;
  elsif new_type = 'mentor' then
    select id into club from public.organizations where is_the_club and removed_at is null;
    if club is not null then
      insert into public.organization_mentors (organization_id, member_id, granted_by)
      values (club, target, auth.uid())
      on conflict do nothing;
    end if;
  end if;
  update public.members set type = new_type where id = target;
end;
$$;
revoke all on function public.admin_set_member_type(uuid, text) from public, anon;
grant execute on function public.admin_set_member_type(uuid, text) to authenticated;

-- The organizations whose mentor a member is, as browse_members draws them.
create or replace function private.mentor_organizations_of(member uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
           order by o.is_the_club, o.name, o.id), '[]'::jsonb)
    from public.organization_mentors g
    join public.organizations o on o.id = g.organization_id
   where g.member_id = member and o.removed_at is null;
$$;

revoke all on function private.mentor_organizations_of(uuid) from public, anon, authenticated;

-- A member's own, for Me.
create or replace function public.my_mentor_organizations()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select private.mentor_organizations_of(auth.uid());
$$;

revoke all on function public.my_mentor_organizations() from public, anon;
grant execute on function public.my_mentor_organizations() to authenticated;

-- ----------------------------------------------------------- browse_members --
-- As 20261022060000, with mentor_organizations at the end.
create or replace view public.browse_members with (security_barrier = true) as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.completeness,
  m.injury_date,
  m.injury_date_precision,
  m.region,
  (extract(year from age(m.birth_date::timestamptz)))::integer as age,
  m.how_injured,
  m.bio,
  m.detail,
  m.gender,
  m.languages,
  m.independence,
  m.employment,
  m.field_of_work,
  m.education,
  m.education_when,
  m.marital_status,
  m.has_children,
  m.children_when,
  m.interests,
  m.topics,
  m.self_care,
  m.affiliations,
  m.wants_to_mentor,
  m.is_seed,
  m.is_admin,
  m.created_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.name, o.id)
      from public.organization_representatives r
      join public.organizations o on o.id = r.organization_id
     where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants,
  m.username::text as username,
  m.injury_type,
  m.condition_name,
  -- Inline, as represented_organizations: a function in a view runs as the
  -- reader, who may not read organization_mentors.
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.is_the_club, o.name, o.id)
      from public.organization_mentors g
      join public.organizations o on o.id = g.organization_id
     where g.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as mentor_organizations
from public.members m
where m.show_in_browse
  and m.status = 'active'
  and exists (
    select 1 from public.members viewer
     where viewer.id = auth.uid() and viewer.status = 'active'
  )
  and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  );
