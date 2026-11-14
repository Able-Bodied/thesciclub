-- ============================================================================
-- Can't go, on the club's own event page
-- ============================================================================
-- The owner, 2026-11-14, after the invite email's Going, Maybe and Can't go
-- (20261114070000): "I like the can't go button. Maybe we should add that to
-- our own event?"
--
-- A member says they cannot come. It takes back their Going or Interested,
-- and the event's organizers see it on the guest list, so whoever asked them
-- has their answer. Nobody else sees it. Going or Interested again clears it,
-- from any build: the store builds know nothing of this and only write
-- event_rsvps, which a trigger watches.
--
-- Not event_rsvps' own status: a store build counts every row there as
-- Going or Interested, so a third value would show somebody who cannot come
-- among those coming. A table of its own changes nothing they read.
--
-- (event_dismissals, a "Not interested" with no visible effect, was dropped
-- in 20260911240000 for having none. This one is seen: by the member, on the
-- button, and by the organizers, on the guest list.)
--
-- Probe: supabase/tests/cant-go.sql.
-- ============================================================================

create table if not exists public.event_declines (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists event_declines_member_idx on public.event_declines (member_id);
alter table public.event_declines enable row level security;
revoke all on public.event_declines from public, anon, authenticated;
comment on table public.event_declines is
  'A member''s Can''t go for an event: seen by them and the event''s organizers. See 20261114080000.';

-- Can't go (true) or not (false). Returns what was set.
create function public.set_event_declined(p_event uuid, p_declined boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not exists (
    select 1 from public.members m where m.id = me and m.status = 'active'
  ) then
    raise exception 'Only an active member can answer.' using errcode = '42501';
  end if;
  if not public.can_see_event(p_event) then
    raise exception 'That event is not there any more.' using errcode = '42501';
  end if;

  if coalesce(p_declined, false) then
    delete from public.event_rsvps r where r.event_id = p_event and r.member_id = me;
    insert into public.event_declines (event_id, member_id) values (p_event, me)
    on conflict do nothing;
    return true;
  end if;
  delete from public.event_declines d where d.event_id = p_event and d.member_id = me;
  return false;
end;
$$;
revoke all on function public.set_event_declined(uuid, boolean) from public, anon;
grant execute on function public.set_event_declined(uuid, boolean) to authenticated;

-- Whether the signed-in member said Can't go.
create function public.my_event_declined(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_declines d
     where d.event_id = p_event and d.member_id = auth.uid()
  );
$$;
revoke all on function public.my_event_declined(uuid) from public, anon;
grant execute on function public.my_event_declined(uuid) to authenticated;

-- Who can't go, for the event's organizers.
create function public.event_declines_for(p_event uuid)
returns table (member_id uuid, name text, username text, photo_path text, declined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can see this.' using errcode = '42501';
  end if;
  return query
    select m.id, m.display_name, m.username::text, m.photo_path, d.created_at
      from public.event_declines d
      join public.members m on m.id = d.member_id and m.status = 'active'
     where d.event_id = p_event
     order by lower(m.display_name);
end;
$$;
revoke all on function public.event_declines_for(uuid) from public, anon;
grant execute on function public.event_declines_for(uuid) to authenticated;

-- Going or Interested, from any build, takes back Can't go.
create function private.rsvp_clears_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_declines d
   where d.event_id = new.event_id and d.member_id = new.member_id;
  return null;
end;
$$;
revoke all on function private.rsvp_clears_decline() from public, anon, authenticated;

create trigger event_rsvps_clear_decline
  after insert or update on public.event_rsvps
  for each row execute function private.rsvp_clears_decline();
