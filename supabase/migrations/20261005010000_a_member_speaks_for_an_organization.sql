-- ============================================================================
-- A member speaks for an organization
-- ============================================================================
-- The owner, 2026-10-05: administrators and organizations can add events by
-- hand. An organization has never been an account here — it is a curated row
-- with a badge — so "an organization adds an event" needs somebody to be the
-- organization. This is that: a member an administrator has linked to an
-- organization, who may then add, change and delete its hand-added events
-- (20261005020000).
--
-- ---------------------------------------------------------------------------
-- Set by an administrator, in the app, and nowhere else
-- ---------------------------------------------------------------------------
-- The owner chose an in-app control over the database-only path the
-- administrator flag takes. It is a smaller power than administrator — it
-- reaches one organization's hand-added events and nothing about members —
-- and an administrator who has to open the database to let NorCal SCI post
-- its own picnic is a step nobody would take.
--
-- Who speaks for which organization is not written in any file. The repo is
-- public, and a list of the people behind an organization's account is the
-- same kind of fact as who is an administrator.
--
-- ---------------------------------------------------------------------------
-- Not `can_invite`
-- ---------------------------------------------------------------------------
-- Any organization in the directory may have somebody speaking for it. Putting
-- a number on the list and putting an event on the calendar are different
-- trusts: BORP runs a dozen events the club lists and cannot let anybody in.
--
-- ---------------------------------------------------------------------------
-- Read through functions, not a view
-- ---------------------------------------------------------------------------
-- The table has RLS on and no policy at all, so nothing in the API reads it
-- directly. A member asks which organizations they speak for; an
-- administrator reads the whole list. Two functions rather than two views,
-- which sidesteps both of a new view's traps (writable by default, and
-- security_barrier lost to a later create or replace).
-- ============================================================================

create table if not exists public.organization_representatives (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- A member deleted, by themselves or an administrator, stops speaking for
  -- anybody: the row goes with them.
  member_id uuid not null references public.members (id) on delete cascade,
  added_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, member_id)
);

create index if not exists organization_representatives_member_idx
  on public.organization_representatives (member_id);

comment on table public.organization_representatives is
  'Members who speak for an organization: they add and change its hand-added events. Set by administrators in the app.';

alter table public.organization_representatives enable row level security;
revoke all on public.organization_representatives from public, anon, authenticated;

-- ------------------------------------------------------------------ helper
-- Whether the caller speaks for this organization. Active members only: a
-- suspended member keeps the row (lifting the suspension gives it back) but
-- cannot use it.
create or replace function public.speaks_for(organization uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_representatives r
      join public.members m on m.id = r.member_id and m.status = 'active'
     where r.organization_id = organization and r.member_id = auth.uid()
  );
$$;

revoke all on function public.speaks_for(uuid) from public, anon;
grant execute on function public.speaks_for(uuid) to authenticated;

-- ----------------------------------------------------- the member's own list
create or replace function public.my_organizations()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select r.organization_id
    from public.organization_representatives r
    join public.members m on m.id = r.member_id and m.status = 'active'
   where r.member_id = auth.uid();
$$;

comment on function public.my_organizations() is
  'The organizations the caller speaks for, and so may add events for.';

revoke all on function public.my_organizations() from public, anon;
grant execute on function public.my_organizations() to authenticated;

-- ------------------------------------------------- the administrators' list
create or replace function public.admin_organization_representatives()
returns table (
  organization_id uuid,
  member_id uuid,
  display_name text,
  member_status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
    select r.organization_id, r.member_id, m.display_name, m.status, r.created_at
      from public.organization_representatives r
      join public.members m on m.id = r.member_id
     order by r.created_at;
end;
$$;

revoke all on function public.admin_organization_representatives() from public, anon;
grant execute on function public.admin_organization_representatives() to authenticated;

-- ----------------------------------------------------------- the two actions
create or replace function public.admin_add_representative(organization uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations o where o.id = organization) then
    raise exception 'That organization is not in the directory.' using errcode = 'P0002';
  end if;
  -- A directory row from the seed is nobody's account: nobody could sign in
  -- and use it.
  if not exists (
    select 1 from public.members m
     where m.id = member and m.status = 'active' and not m.is_seed
  ) then
    raise exception 'Only a member who has joined and is active can speak for an organization.'
      using errcode = 'P0002';
  end if;

  insert into public.organization_representatives (organization_id, member_id, added_by)
  values (organization, member, auth.uid())
  on conflict (organization_id, member_id) do nothing;
end;
$$;

create or replace function public.admin_remove_representative(organization uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  -- Their events stay: they are the organization's, not the person's.
  delete from public.organization_representatives r
   where r.organization_id = organization and r.member_id = member;
end;
$$;

revoke all on function public.admin_add_representative(uuid, uuid) from public, anon;
revoke all on function public.admin_remove_representative(uuid, uuid) from public, anon;
grant execute on function public.admin_add_representative(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_representative(uuid, uuid) to authenticated;
