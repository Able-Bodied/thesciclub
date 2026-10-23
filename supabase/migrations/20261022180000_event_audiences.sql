-- ============================================================================
-- Who can see an event: anyone with the link, the club, followers, or groups
-- ============================================================================
-- The owner, 2026-10-22. Each event has an audience:
--
--   public     a public page anyone with the link can read (public_event),
--              with no counts and nobody's name on it; inside the club it
--              reads like 'club'
--   club       every member, as events have been since 2026-10-08
--   followers  members who follow the hosting organization
--   groups     members of the group chats the organizer chose
--
-- Whoever may change the event (may_change_event: an administrator, or a
-- member who speaks for its organization), whoever added it, and whoever
-- already said they are going or interested always see it: narrowing an
-- audience never quietly drops somebody who said yes.
--
-- can_see_event() is the one rule, and everything that shows an event, its
-- RSVPs or who is going reads it: the events policy, the series and tags
-- policies, both RSVP views, and the RSVP insert and update policies (so a
-- member cannot say yes to an event they cannot see, and so cannot reach its
-- group chat or its reminder). Every event so far stays 'club'.
--
-- Not filtered, on purpose for now: the daily "N new events" count for an
-- organization's followers counts a groups-only event too (a number, never a
-- title), and an event cover's file can be read by any member who has its
-- path, which carries the event's unguessable id.
-- ============================================================================

alter table public.events
  add column if not exists audience text not null default 'club'
    check (audience in ('public', 'club', 'followers', 'groups'));

comment on column public.events.audience is
  'public, club, followers or groups: who can see the event. See 20261022180000.';

grant select (audience) on public.events to anon, authenticated;

-- The group chats a groups-only event is for. Written by set_event_audience only.
create table public.event_audience_groups (
  event_id  uuid not null references public.events (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  primary key (event_id, thread_id)
);

create index event_audience_groups_thread_idx on public.event_audience_groups (thread_id);

alter table public.event_audience_groups enable row level security;
revoke all on public.event_audience_groups from public, anon, authenticated;

comment on table public.event_audience_groups is
  'The group chats an event with audience groups is for. See 20261022180000.';

-- ---------------------------------------------------------------- the rule --
create or replace function public.can_see_event(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member() and exists (
    select 1 from public.events e
     where e.id = event
       and (
         e.audience in ('public', 'club')
         or public.is_admin()
         or e.added_by = auth.uid()
         or (e.organization_id is not null and public.speaks_for(e.organization_id))
         or (
           e.audience = 'followers'
           and exists (
             select 1 from public.organization_follows f
              where f.organization_id = e.organization_id and f.member_id = auth.uid()
           )
         )
         or (
           e.audience = 'groups'
           and exists (
             select 1 from public.event_audience_groups g
               join public.chat_thread_members t
                 on t.thread_id = g.thread_id and t.member_id = auth.uid()
              where g.event_id = e.id
           )
         )
         or exists (
           select 1 from public.event_rsvps r
            where r.event_id = e.id and r.member_id = auth.uid()
         )
       )
  );
$$;

comment on function public.can_see_event(uuid) is
  'Whether the caller, a member, can see this event: its audience, or because they may change it, added it, or already said yes. See 20261022180000.';

revoke all on function public.can_see_event(uuid) from public, anon;
grant execute on function public.can_see_event(uuid) to authenticated;

-- ---------------------------------------------------------------- policies --
drop policy if exists "members read events" on public.events;
create policy "members read the events they can see"
  on public.events for select to authenticated
  using (
    (select public.is_member())
    and (audience in ('public', 'club') or public.can_see_event(id))
  );

-- A series and its tags are read through the events they belong to, and the
-- events policy decides those.
drop policy if exists "members read event series" on public.event_series;
create policy "members read the series of events they can see"
  on public.event_series for select to authenticated
  using (
    (select public.is_member())
    and exists (select 1 from public.events e where e.series_id = event_series.id)
  );

drop policy if exists "members read event tags" on public.event_tags;
create policy "members read the tags of events they can see"
  on public.event_tags for select to authenticated
  using (
    (select public.is_member())
    and exists (select 1 from public.events e where e.id = event_tags.event_id)
  );

-- Saying yes needs an event the member can see.
drop policy if exists "members create own rsvps" on public.event_rsvps;
create policy "members create own rsvps"
  on public.event_rsvps for insert
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
    and public.can_see_event(event_id)
  );

drop policy if exists "members change own rsvps" on public.event_rsvps;
create policy "members change own rsvps"
  on public.event_rsvps for update
  using (member_id = auth.uid())
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
    and public.can_see_event(event_id)
  );

-- ------------------------------------------------------------------- views --
-- As 20261012080000, counting only the events the caller can see.
create or replace view public.event_rsvp_counts
with (security_barrier = true) as
select
  event_id,
  count(*) filter (where status = 'going')::int as going_count,
  count(*) filter (where status = 'interested')::int as interested_count
from public.event_rsvps
where (select public.is_member())
  and public.can_see_event(event_id)
group by event_id;

-- As 20261015000000, for the events the caller can see.
create or replace view public.event_attendees with (security_barrier = true) as
select
  r.event_id,
  r.status,
  r.created_at as rsvp_created_at,
  m.id as member_id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.level_range,
  m.exact_level,
  m.type,
  m.injury_type,
  m.condition_name
from public.event_rsvps r
join public.browse_members m on m.id = r.member_id
where public.can_see_event(r.event_id);

-- ------------------------------------------------------- setting the audience --
-- For the event form, after save_event: this date and, in a series, every
-- later date. Followers needs an organization; groups needs group chats the
-- caller is in (an administrator may name any).
create or replace function public.set_event_audience(event uuid, audience text, groups uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target public.events%rowtype;
  chosen uuid[] := coalesce(groups, '{}');
  bad uuid;
  dates uuid[];
begin
  select * into target from public.events e where e.id = event;
  if not found or not public.may_change_event(event) then
    raise exception 'You cannot change who sees this event.' using errcode = '42501';
  end if;
  if audience is null or audience not in ('public', 'club', 'followers', 'groups') then
    raise exception 'Choose who can see the event.' using errcode = '22023';
  end if;
  if audience = 'followers' and target.organization_id is null then
    raise exception 'Only an organization''s event can be for its followers.' using errcode = '22023';
  end if;
  if audience = 'groups' then
    if cardinality(chosen) = 0 then
      raise exception 'Choose at least one group.' using errcode = '22023';
    end if;
    select g into bad
      from unnest(chosen) g
     where not exists (
       select 1 from public.chat_threads t
        where t.id = g and t.kind = 'group'
          and (
            public.is_admin()
            or exists (
              select 1 from public.chat_thread_members m
               where m.thread_id = t.id and m.member_id = auth.uid()
            )
          )
     )
     limit 1;
    if bad is not null then
      raise exception 'One of those groups is not yours to choose.' using errcode = '42501';
    end if;
  else
    chosen := '{}';
  end if;

  select coalesce(array_agg(e.id), '{}') into dates
    from public.events e
   where e.id = target.id
      or (target.series_id is not null and e.series_id = target.series_id
          and e.start_time >= target.start_time);

  update public.events e set audience = set_event_audience.audience, updated_at = now()
   where e.id = any (dates);
  delete from public.event_audience_groups g where g.event_id = any (dates);
  insert into public.event_audience_groups (event_id, thread_id)
  select d, g from unnest(dates) d cross join unnest(chosen) g;
end;
$$;

revoke all on function public.set_event_audience(uuid, text, uuid[]) from public, anon;
grant execute on function public.set_event_audience(uuid, text, uuid[]) to authenticated;

-- For the event form when changing an event: the groups it is for.
create or replace function public.event_audience_groups_of(event uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.thread_id from public.event_audience_groups g
   where g.event_id = event and public.may_change_event(event);
$$;

revoke all on function public.event_audience_groups_of(uuid) from public, anon;
grant execute on function public.event_audience_groups_of(uuid) to authenticated;

-- A new date of a series takes the audience of the date before it.
create or replace function private.event_takes_its_series_audience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_it uuid;
begin
  if new.series_id is null then
    return new;
  end if;
  select e.id into before_it from public.events e
   where e.series_id = new.series_id and e.id <> new.id
   order by e.start_time desc limit 1;
  if before_it is null then
    return new;
  end if;
  update public.events set audience = (select audience from public.events where id = before_it)
   where id = new.id;
  insert into public.event_audience_groups (event_id, thread_id)
  select new.id, g.thread_id from public.event_audience_groups g where g.event_id = before_it
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.event_takes_its_series_audience() from public, anon, authenticated;

create trigger events_take_their_series_audience
  after insert on public.events
  for each row when (new.series_id is not null)
  execute function private.event_takes_its_series_audience();

-- For a member who cannot see an event, from a shared link: who it is for, and
-- nothing else. Never its title, time or place, and never which groups. Null
-- when the event is missing or they can see it.
create or replace function public.event_audience_hint(event uuid)
returns table (
  audience text,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.audience,
         case when e.audience = 'followers' then o.id end,
         case when e.audience = 'followers' then o.name end,
         case when e.audience = 'followers' then o.short_code end,
         case when e.audience = 'followers' then o.logo_path end
    from public.events e
    left join public.organizations o on o.id = e.organization_id
   where e.id = event
     and public.is_member()
     and not public.can_see_event(event);
$$;

revoke all on function public.event_audience_hint(uuid) from public, anon;
grant execute on function public.event_audience_hint(uuid) to authenticated;

-- -------------------------------------------------------- the public page --
-- What anybody with the link may read of a public event: what an organization
-- would put on its own calendar. Nobody's name (not the host's: that may be a
-- member), no counts, nothing about who is going.
create or replace function public.public_event(event uuid)
returns table (
  id uuid,
  title text,
  description text,
  description_html text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  timezone text,
  location text,
  city text,
  state text,
  event_format text,
  url text,
  registration_url text,
  photo_path text,
  photo_alt text,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.description_html, e.start_time, e.end_time,
         e.all_day, e.timezone, e.location, e.city, e.state, e.event_format, e.url,
         e.registration_url, e.photo_path, e.photo_alt,
         o.id, o.name, o.short_code, o.logo_path
    from public.events e
    left join public.organizations o on o.id = e.organization_id and o.removed_at is null
   where e.id = event and e.audience = 'public';
$$;

revoke all on function public.public_event(uuid) from public;
grant execute on function public.public_event(uuid) to anon, authenticated;

-- A public event's cover, for the public page.
create or replace function public.event_cover_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.audience = 'public' and e.photo_path = object_name
  );
$$;

revoke all on function public.event_cover_is_public(text) from public;
grant execute on function public.event_cover_is_public(text) to anon, authenticated;

create policy "anyone reads a public event's cover"
  on storage.objects for select
  to anon
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'events'
    and public.event_cover_is_public(name)
  );
