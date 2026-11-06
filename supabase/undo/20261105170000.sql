-- Undo for 20261105170000_an_event_has_co_hosts.sql: no co-hosts, and
-- calendar_absorb as 20261105140000 left it. The co-hosts set are lost.

drop trigger if exists events_take_their_series_cohosts on public.events;
drop trigger if exists events_lead_is_not_a_cohost on public.events;
drop function if exists private.event_takes_its_series_cohosts();
drop function if exists private.event_lead_is_not_a_cohost();
drop function if exists public.leave_event_cohost(uuid, uuid, boolean);
drop function if exists public.set_event_cohosts(uuid, uuid[], boolean);

create or replace function private.calendar_absorb(hand uuid, made uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  theirs uuid;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if hand is null or made is null or hand = made then
    return;
  end if;
  -- Nobody added anybody: as 20261101090000 gathers an event chat.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select t.id into theirs from public.chat_threads t where t.event_id = hand;
  if theirs is not null and not exists (select 1 from public.chat_threads t where t.event_id = made) then
    update public.chat_threads t set event_id = made where t.id = theirs;
  end if;
  insert into public.event_rsvps (event_id, member_id, status)
  select made, x.member_id, x.status from public.event_rsvps x where x.event_id = hand
  on conflict (event_id, member_id) do nothing;
  delete from public.events e where e.id = hand;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
end;
$$;

drop table if exists public.event_cohosts;
