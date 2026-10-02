-- ============================================================================
-- Nobody can ask whether a number is invited
-- ============================================================================
-- From the Supabase advisor, 2026-10-01. Two functions answered "is this
-- number on the club's list?" for any number at all:
--
--   before_user_created(event)  executable by anon, so anybody with the
--                               site's public key could ask, signed out
--   has_active_invite(phone)    executable by any signed-in account
--
-- That a number is on the list says that its owner has a spinal cord injury,
-- or that somebody who works with people who do thinks so. It is not a thing
-- to answer for a stranger.
--
-- before_user_created is an Auth hook. Only Auth calls it, as
-- supabase_auth_admin, which keeps its grant; it is not even switched on
-- (Authentication → Hooks), so nothing changes today.
--
-- has_active_invite has one caller that is not itself a definer function: the
-- members insert policy, which only ever asks about the caller's own verified
-- number. It now calls my_number_is_invited(), which takes no number and so
-- can be asked about nobody else. has_active_invite stays as it is for the
-- definer functions and the hook, which run as its owner.
-- ============================================================================

revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;

create or replace function public.my_number_is_invited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- The number Auth verified, never one the caller supplies.
  select public.has_active_invite(auth.jwt() ->> 'phone');
$$;

comment on function public.my_number_is_invited() is
  'has_active_invite for the caller''s own verified number, and nobody else''s.';

revoke all on function public.my_number_is_invited() from public, anon;
grant execute on function public.my_number_is_invited() to authenticated;

-- As 20260910120200 wrote it, with the one call changed.
drop policy if exists "members insert own row, and only with an invite" on public.members;
create policy "members insert own row, and only with an invite"
  on public.members for insert
  with check (
    auth.uid() = id
    and phone = public.normalize_phone(auth.jwt() ->> 'phone')
    and public.my_number_is_invited()
  );

revoke all on function public.has_active_invite(text) from public, anon, authenticated;
grant execute on function public.has_active_invite(text) to supabase_auth_admin;
