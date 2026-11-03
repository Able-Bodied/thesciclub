-- ============================================================================
-- An event registration says what comes next
-- ============================================================================
-- The owner, 2026-11-02: after registering for an event on its public page,
-- somebody whose address is a member's is asked to sign in; one whose address
-- is invited (or anybody, while joining is open) is asked to create the
-- account; anybody else is offered an invite request with what they typed.
--
-- Until now the page said the same to everybody, so that it never told who is
-- in the club (20261022190000). The owner decided otherwise: "I don't think
-- this should be a concern. There are people in the club that do not have an
-- SCI.. We have family members etc." So this answers which of the three an
-- address is, but only for an address registered for that event in the last
-- 15 minutes, which register_for_event limits, so it is not a free lookup.
--
-- A blocked address is told to ask, and the request goes nowhere
-- (request_invite), as before.
-- ============================================================================

create or replace function public.registration_next_step(p_event uuid, p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  address text := public.normalize_email(p_email);
begin
  if address is null or not exists (
    select 1 from public.event_registrations r
     where r.event_id = p_event
       and r.email = address::extensions.citext
       and r.updated_at > now() - interval '15 minutes'
  ) then
    raise exception 'Register for the event first.' using errcode = '22023';
  end if;

  if public.is_blocked_email(address) then
    return 'request';
  end if;
  if exists (
    select 1 from auth.users u
      join public.members m on m.id = u.id and m.status = 'active'
     where lower(u.email::text) = address
  ) then
    return 'member';
  end if;
  if public.joining_is_open() or exists (
    select 1 from public.invites i
     where i.status = 'pending' and lower(i.email::text) = address
  ) then
    return 'invited';
  end if;
  return 'request';
end;
$$;

revoke all on function public.registration_next_step(uuid, text) from public;
grant execute on function public.registration_next_step(uuid, text) to anon, authenticated;
