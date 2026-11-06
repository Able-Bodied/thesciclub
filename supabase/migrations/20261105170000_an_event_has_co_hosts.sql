-- ============================================================================
-- An event has co-hosts
-- ============================================================================
-- The owner, 2026-11-05: an event can be hosted by several organizations, and
-- the hosting organization's admins (or a club administrator) can add a
-- co-host to an event already on the calendar.
--
-- Added beside the host, never in its place: events.organization_id stays the
-- one lead host, and save_event is untouched, because the store app's builds
-- 1.0.5 and 1.2.0 read that column and call that function. They show the lead
-- host only; nothing they do removes a co-host.
--
-- Who may:
--   - set the co-hosts: whoever may post events for the lead host
--     (may_post_events_for: its admins, or a club administrator), imported
--     and calendar events too, since the co-hosts are the club's, not the
--     calendar's;
--   - take a co-host off: also that co-host's own admins, for their own
--     organization only.
-- Co-hosts do not change the event; the lead host does.
--
-- A repeating event: "and later dates" sets each later date the same way, and
-- a date the series adds later starts with the co-hosts of the date before it.
-- ============================================================================

create table public.event_cohosts (
  event_id        uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  added_by        uuid references public.members (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (event_id, organization_id)
);
create index event_cohosts_organization_idx on public.event_cohosts (organization_id);

comment on table public.event_cohosts is
  'Organizations hosting an event beside its lead host (events.organization_id). Written only through set_event_cohosts and leave_event_cohost. See 20261105170000.';

alter table public.event_cohosts enable row level security;
revoke all on public.event_cohosts from public, anon, authenticated;
grant select on public.event_cohosts to authenticated;
grant select, insert, update, delete on public.event_cohosts to service_role;

-- Read through the events they belong to, as the tags are: the events policy
-- decides who sees them.
create policy "members read the co-hosts of events they can see"
  on public.event_cohosts for select to authenticated
  using (
    (select public.is_member())
    and exists (select 1 from public.events e where e.id = event_cohosts.event_id)
  );

-- ------------------------------------------------------------- setting them
create or replace function public.set_event_cohosts(
  event uuid,
  organizations uuid[],
  later boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  this public.events%rowtype;
  wanted uuid[];
  target record;
  changed integer := 0;
begin
  if me is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into this from public.events e where e.id = set_event_cohosts.event;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct x), '{}') into wanted
    from unnest(coalesce(organizations, '{}')) x
   where x is not null;
  if cardinality(wanted) > 10 then
    raise exception 'An event can have 10 co-hosts at most.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(wanted) x
     where not exists (select 1 from public.organizations o where o.id = x)
  ) then
    raise exception 'That organization is not in the directory.' using errcode = 'P0002';
  end if;

  for target in
    select e.id, e.organization_id
      from public.events e
     where e.id = this.id
        or (later and this.series_id is not null
            and e.series_id = this.series_id and e.start_time > this.start_time)
     order by e.start_time
       for update
  loop
    if not public.may_post_events_for(target.organization_id) then
      raise exception 'Only the hosting organization can choose its co-hosts.'
        using errcode = '42501';
    end if;
    delete from public.event_cohosts c
     where c.event_id = target.id
       and not (c.organization_id = any (wanted));
    insert into public.event_cohosts (event_id, organization_id, added_by)
    select target.id, x, me
      from unnest(wanted) x
     where x is distinct from target.organization_id
    on conflict (event_id, organization_id) do nothing;
    changed := changed + 1;
  end loop;

  return changed;
end;
$$;

comment on function public.set_event_cohosts(uuid, uuid[], boolean) is
  'Sets an event''s co-hosts to exactly these organizations (the lead host is left out), and with later its series'' later dates too. Its lead host''s admins or a club administrator. See 20261105170000.';

revoke all on function public.set_event_cohosts(uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_event_cohosts(uuid, uuid[], boolean) to authenticated;

-- ------------------------------------------------------- stepping down as one
create or replace function public.leave_event_cohost(
  event uuid,
  organization uuid,
  later boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  this public.events%rowtype;
  gone integer;
begin
  if me is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into this from public.events e where e.id = leave_event_cohost.event;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if organization is null
     or not (public.may_post_events_for(organization)
             or public.may_post_events_for(this.organization_id)) then
    raise exception 'You cannot change who hosts this event.' using errcode = '42501';
  end if;

  delete from public.event_cohosts c
   using public.events e
   where c.event_id = e.id
     and c.organization_id = leave_event_cohost.organization
     and (e.id = this.id
          or (later and this.series_id is not null
              and e.series_id = this.series_id and e.start_time > this.start_time))
     -- A lead host's admin takes a co-host off only their own events.
     and (public.may_post_events_for(leave_event_cohost.organization)
          or public.may_post_events_for(e.organization_id));
  get diagnostics gone = row_count;
  return gone;
end;
$$;

comment on function public.leave_event_cohost(uuid, uuid, boolean) is
  'Takes one co-host off an event (and with later, its series'' later dates): that organization''s own admins, the lead host''s, or a club administrator. See 20261105170000.';

revoke all on function public.leave_event_cohost(uuid, uuid, boolean) from public, anon;
grant execute on function public.leave_event_cohost(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- keeping it
-- A lead host is never also its own co-host: when an event's host changes
-- to one of its co-hosts, that co-host row goes.
create or replace function private.event_lead_is_not_a_cohost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_cohosts c
   where c.event_id = new.id and c.organization_id = new.organization_id;
  return new;
end;
$$;

create trigger events_lead_is_not_a_cohost
  after update of organization_id on public.events
  for each row
  when (new.organization_id is not null and new.organization_id is distinct from old.organization_id)
  execute function private.event_lead_is_not_a_cohost();

-- A date a series adds (extend_event_series, a calendar's repeating
-- invitation) starts with the co-hosts of the date before it.
create or replace function private.event_takes_its_series_cohosts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_cohosts (event_id, organization_id, added_by)
  select new.id, c.organization_id, c.added_by
    from public.event_cohosts c
   where c.event_id = (
           select e.id from public.events e
            where e.series_id = new.series_id and e.id <> new.id
              and e.start_time < new.start_time
            order by e.start_time desc
            limit 1
         )
     and c.organization_id is distinct from new.organization_id
  on conflict (event_id, organization_id) do nothing;
  return new;
end;
$$;

create trigger events_take_their_series_cohosts
  after insert on public.events
  for each row
  when (new.series_id is not null)
  execute function private.event_takes_its_series_cohosts();

-- ------------------------------------------------- a calendar takes one over
-- As 20261105140000, with the hand-made event's co-hosts carried over with
-- its chat and RSVPs.
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
  insert into public.event_cohosts (event_id, organization_id, added_by)
  select made, c.organization_id, c.added_by
    from public.event_cohosts c
   where c.event_id = hand
     and c.organization_id is distinct from (select e.organization_id from public.events e where e.id = made)
  on conflict (event_id, organization_id) do nothing;
  delete from public.events e where e.id = hand;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
end;
$$;
