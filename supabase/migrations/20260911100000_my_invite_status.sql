-- ============================================================================
-- my_invite_status — what the person signing up is allowed to know
-- ============================================================================
-- Onboarding needs two answers after somebody verifies their number: is this
-- number on the list, and does it entitle them to claim a seeded profile.
--
-- ---------------------------------------------------------------------------
-- Why this is not asked before the OTP
-- ---------------------------------------------------------------------------
-- The obvious flow checks the list first, so an uninvited number is turned away
-- without being texted. That is better for cost and for the person, and it is
-- the wrong trade here.
--
-- A check that anybody can call with any phone number is an oracle, and what it
-- discloses is not "is this number a member of some app". Everybody in this
-- club has a spinal cord injury. A public endpoint answering yes or no per
-- phone number therefore discloses a protected health condition about
-- identifiable people, to anybody willing to iterate. Rate limiting narrows
-- that; it does not close it.
--
-- So the number is verified first, and only then does the club say anything.
-- The caller learns about the number they just proved they control and no
-- other. The cost is an SMS to somebody who turns out not to be invited, which
-- is a cost we can absorb and a disclosure we cannot take back.
--
-- `has_active_invite(text)` keeps its grant to `authenticated` because the
-- members insert policy calls it, but `anon` loses it: nothing signed out has
-- any business asking.
-- ============================================================================

revoke execute on function public.has_active_invite(text) from anon;

create or replace function public.my_invite_status()
returns table (invited boolean, claimable_member_id uuid)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  -- The phone comes from the verified JWT, never from an argument, so this
  -- cannot be pointed at somebody else's number.
  select
    i.id is not null as invited,
    i.seed_member_id as claimable_member_id
  from (select public.normalize_phone(auth.jwt() ->> 'phone') as phone) me
  left join public.invites i
    on i.phone = me.phone
   and i.status in ('pending', 'consumed')
  limit 1;
$$;

revoke all on function public.my_invite_status() from public;
revoke all on function public.my_invite_status() from anon;
grant execute on function public.my_invite_status() to authenticated;
