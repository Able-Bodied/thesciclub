-- ============================================================================
-- Administrators
-- ============================================================================
-- Somebody has to be able to remove an account, suspend a member who breaks the
-- house rules, and see who has actually joined. docs/CONTEXT.md says membership
-- can be taken away; this is the mechanism that makes that sentence true.
--
-- ---------------------------------------------------------------------------
-- The flag cannot be set from inside the app
-- ---------------------------------------------------------------------------
-- `members` already lets a member update their own row. Adding `is_admin` to
-- that table without more would therefore be a one-line privilege escalation:
-- update your own row, set the flag, and you run the club.
--
-- So a trigger refuses any change to `is_admin` made by the `authenticated`
-- role — including by an existing administrator. Granting administrator is a
-- service-role operation, done deliberately and out of band. There is no
-- in-app promotion path to find a hole in, and no "admin makes admin" chain to
-- reason about.
--
-- ---------------------------------------------------------------------------
-- What an administrator can see
-- ---------------------------------------------------------------------------
-- Not `members` directly — that keeps its own-row-only policies, so a stolen
-- admin session cannot `select *` the table. They read `admin_members`, which
-- carries the phone number, because matching a person to an invite is the
-- actual job, and does NOT carry `birth_date`, because no administrative task
-- needs it and every screen reads a derived age.
-- ============================================================================

alter table public.members
  add column if not exists is_admin boolean not null default false;

comment on column public.members.is_admin is
  'Set only by the service role. The trigger below refuses changes from the app.';

-- ------------------------------------------------------- no self-promotion
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user = 'authenticated' then
    raise exception 'Administrator status cannot be changed from the application';
  end if;
  return new;
end;
$$;

drop trigger if exists members_protect_admin_flag on public.members;
create trigger members_protect_admin_flag
  before update on public.members
  for each row execute function public.protect_admin_flag();

-- ------------------------------------------------------------------ helper
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and is_admin and status = 'active'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- --------------------------------------------------------- the admin roster
drop view if exists public.admin_members;

create view public.admin_members as
select
  m.id,
  m.display_name,
  m.phone,
  m.type,
  m.status,
  m.is_admin,
  m.is_seed,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.show_in_browse,
  m.created_at,
  m.updated_at
from public.members m
where public.is_admin();

revoke all on public.admin_members from anon, public;
grant select on public.admin_members to authenticated;

-- ------------------------------------------------------------- the actions
-- Functions rather than policies: the rules here are about *which* row, and a
-- refusal should say why rather than silently affecting zero rows.

create or replace function public.admin_set_member_status(target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if new_status not in ('active', 'suspended', 'removed') then
    raise exception 'Unknown status: %', new_status;
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own membership status';
  end if;

  update public.members set status = new_status where id = target;
  if not found then
    raise exception 'No such member';
  end if;
end;
$$;

create or replace function public.admin_delete_member(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account from here';
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  if target_is_admin then
    -- Deliberate: an administrator is removed by the service role, so two
    -- administrators cannot lock each other out of the club they run.
    raise exception 'An administrator cannot be deleted from the application';
  end if;

  -- The member row goes. The auth account behind it survives and is inert:
  -- browse_members yields nothing without a membership, and rejoining still
  -- requires an invite. Deleting the auth user needs the service role.
  delete from public.members where id = target;
end;
$$;

revoke all on function public.admin_set_member_status(uuid, text) from public, anon;
revoke all on function public.admin_delete_member(uuid) from public, anon;
grant execute on function public.admin_set_member_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;
