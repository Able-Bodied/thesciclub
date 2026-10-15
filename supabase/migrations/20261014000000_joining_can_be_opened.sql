-- ============================================================================
-- Joining can be opened to anybody, and closed again
-- ============================================================================
-- The owner, 2026-10-14: at events, somebody who hears about the club should
-- be able to join on the spot, without waiting for an invite. So an
-- administrator has a switch (Admin, Invites tab): invite only, or anybody can
-- join. It starts closed, which is how the club has always been.
--
-- Two things decide who gets in, and both read the switch:
--
--   * signup_needs_an_invite, the Before User Created hook (20261012040000).
--     Open, an email sign-up passes on its address alone, as long as the
--     address is not blocked. Google and Apple passed already.
--   * i_am_invited(), which my_invite_status() returns to the join screen and
--     the members insert policy checks (20261012000000). Open, it is true for
--     a signed-in account with a CONFIRMED address that is not blocked. An
--     account with no confirmed address is still refused: blocking is by
--     address, so one without could never be shut out.
--
-- What does not change: a blocked address stays out either way, a removed
-- member keeps their row (status 'removed') and so cannot join again, and an
-- invite still works exactly as before. Closing joining again shuts the door
-- for new accounts only; whoever joined while it was open stays a member.
-- A member who joined with no invite has no invite_id.
--
-- Whether joining is open is not a secret: the welcome and join screens read
-- it (joining_is_open(), for anon too) to stop saying an invite is needed.
-- ============================================================================

create table if not exists public.club_joining (
  -- One row, ever.
  only_row boolean primary key default true check (only_row),
  open boolean not null default false,
  changed_at timestamptz,
  changed_by uuid references public.members (id) on delete set null
);

comment on table public.club_joining is
  'Whether anybody can join (open) or only somebody invited. One row. See 20261014000000.';

insert into public.club_joining (only_row, open) values (true, false)
on conflict (only_row) do nothing;

alter table public.club_joining enable row level security;
revoke all on public.club_joining from public, anon, authenticated;
grant select on public.club_joining to authenticated;

drop policy if exists "administrators read who can join" on public.club_joining;
create policy "administrators read who can join"
  on public.club_joining for select
  using (public.is_admin());

-- ------------------------------------------------------------- reading it
create or replace function public.joining_is_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select j.open from public.club_joining j where j.only_row), false);
$$;

comment on function public.joining_is_open() is
  'True when anybody may join without an invite. Public on purpose. See 20261014000000.';

revoke all on function public.joining_is_open() from public;
grant execute on function public.joining_is_open() to anon, authenticated;

-- ------------------------------------------------------------- changing it
create or replace function public.admin_set_joining_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  if p_open is null then
    raise exception 'Say whether joining is open.' using errcode = '22023';
  end if;
  update public.club_joining
     set open = p_open,
         changed_at = now(),
         changed_by = auth.uid()
   where only_row;
end;
$$;

revoke all on function public.admin_set_joining_open(boolean) from public, anon;
grant execute on function public.admin_set_joining_open(boolean) to authenticated;

-- ------------------------------------------------------- the sign-up hook
-- As 20261012040000, with the open door added before the invite checks.
create or replace function public.signup_needs_an_invite(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '');
  address text := public.normalize_email(event -> 'user' ->> 'email');
  token text := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_token', ''));
begin
  if provider in ('google', 'apple') then
    return '{}'::jsonb;
  end if;

  -- Only an email sign-up is judged on its address and token. Anything else
  -- (phone, anonymous, a payload with no provider) is refused: it fails closed,
  -- open or not.
  if provider = 'email'
     and address is not null
     and not public.is_blocked_email(address)
     and (
       public.joining_is_open()
       or exists (
         select 1 from public.invites i
          where i.status = 'pending'
            and lower(i.email::text) = address
       )
       or (
         token <> ''
         and exists (
           select 1 from public.invites i
            where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
              and i.status = 'pending'
              and i.claimed_by is null
         )
       )
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not on the invite list.'
    )
  );
end;
$$;

comment on function public.signup_needs_an_invite(jsonb) is
  'Before User Created hook: an email sign-up needs a pending invite for its address, or a live invite token, unless joining is open. See 20261012040000 and 20261014000000.';

revoke execute on function public.signup_needs_an_invite(jsonb) from public, anon, authenticated;
grant execute on function public.signup_needs_an_invite(jsonb) to supabase_auth_admin;

-- ------------------------------------------------------------ who may join
-- As 20261012000000, with the open door added. The name stays: the members
-- insert policy and my_invite_status() call it by it.
create or replace function public.i_am_invited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Consumed counts as well as pending: the members insert policy is judged
  -- after consume_invite_for_new_member has marked the invite consumed.
  select exists (
    select 1
      from (
        select auth.uid() as id, private.confirmed_email(auth.uid()) as email
      ) me
     where me.id is not null
       and not (me.email is not null and public.is_blocked_email(me.email))
       and (
         (public.joining_is_open() and me.email is not null)
         or exists (
           select 1 from public.invites i
            where i.status in ('pending', 'consumed')
              and (
                i.claimed_by = me.id
                or (me.email is not null and lower(i.email::text) = me.email)
              )
         )
       )
  );
$$;

comment on function public.i_am_invited() is
  'True when joining is open and the caller has a CONFIRMED address, or a live invite is claimed by the caller or names that address; never when the address is blocked. Answers only about the caller.';

revoke all on function public.i_am_invited() from public, anon;
grant execute on function public.i_am_invited() to authenticated;
