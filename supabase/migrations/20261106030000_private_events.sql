-- ============================================================================
-- Private events: members of chosen organizations, or invite only
-- ============================================================================
-- The owner, 2026-11-06: an org admin can make any of its organization's
-- events, imported ones included, private: for the members of one or more of
-- the organizations they are an org admin of ('organizations'), or for the
-- people they choose ('people'). Nobody else sees it, in the app or from its
-- link, and each person invited is told (an event_notice, "<org> invited you
-- to <event>").
--
-- Private is 'followers', 'organizations' and 'people'. For those, the share
-- link opens the event only for whoever can already see it (the owner chose
-- this over 20261029110000's open link), registering from it is refused,
-- its cover is not public, and its group chat takes only its audience.
-- 'groups' stays as it was.
--
-- set_event_visibility is the new writer. Unlike set_event_audience it lets
-- an org admin change an imported event's audience (and nothing else about
-- it). set_event_audience stays for the store builds (1.0.5, 1.2.0), which
-- send only the audiences they know.
-- ============================================================================

alter table public.events drop constraint events_audience_check;
alter table public.events add constraint events_audience_check
  check (audience in ('public', 'club', 'followers', 'groups', 'organizations', 'people'));

comment on column public.events.audience is
  'public, club, followers, groups, organizations or people: who can see the event. See 20261022180000 and 20261106030000.';

create table public.event_audience_organizations (
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (event_id, organization_id)
);
create index event_audience_organizations_org_idx
  on public.event_audience_organizations (organization_id);
alter table public.event_audience_organizations enable row level security;
revoke all on public.event_audience_organizations from public, anon, authenticated;

create table public.event_invitees (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  invited_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index event_invitees_member_idx on public.event_invitees (member_id);
alter table public.event_invitees enable row level security;
revoke all on public.event_invitees from public, anon, authenticated;

comment on table public.event_audience_organizations is
  'The organizations whose members see an organizations event. Written by set_event_visibility. See 20261106030000.';
comment on table public.event_invitees is
  'Who an invite-only (people) event is for. Written by set_event_visibility. See 20261106030000.';

-- --------------------------------------------------------------- private --
create function private.event_is_private(p_audience text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_audience in ('followers', 'organizations', 'people');
$$;
revoke all on function private.event_is_private(text) from public, anon, authenticated;

-- ------------------------------------------------------------ the rules --
-- As 20261103000000, and the two new audiences.
create or replace function private.member_sees_event(p_member uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event
       and (
         e.audience in ('public', 'club')
         or e.added_by = p_member
         or exists (
           select 1 from public.organization_representatives r
            where r.organization_id = e.organization_id and r.member_id = p_member
         )
         or (
           e.audience = 'followers'
           and (
             exists (
               select 1 from public.organization_follows f
                where f.organization_id = e.organization_id and f.member_id = p_member
             )
             or exists (
               select 1 from public.organization_members om
                where om.organization_id = e.organization_id and om.member_id = p_member
                  and om.left_at is null and om.denied_at is null
             )
           )
         )
         or (
           e.audience = 'groups'
           and exists (
             select 1 from public.event_audience_groups g
               join public.chat_thread_members t
                 on t.thread_id = g.thread_id and t.member_id = p_member
              where g.event_id = e.id
           )
         )
         or (
           e.audience = 'organizations'
           and exists (
             select 1 from public.event_audience_organizations a
              where a.event_id = e.id
                and (
                  exists (select 1 from public.organization_follows f
                           where f.organization_id = a.organization_id and f.member_id = p_member)
                  or exists (select 1 from public.organization_members om
                              where om.organization_id = a.organization_id and om.member_id = p_member
                                and om.left_at is null and om.denied_at is null)
                  or exists (select 1 from public.organization_representatives r
                              where r.organization_id = a.organization_id and r.member_id = p_member)
                )
           )
         )
         or (
           e.audience = 'people'
           and exists (
             select 1 from public.event_invitees i
              where i.event_id = e.id and i.member_id = p_member
           )
         )
       )
  );
$$;
revoke all on function private.member_sees_event(uuid, uuid) from public, anon, authenticated;

-- As 20261022180000: the audience, an administrator, whoever added it or may
-- post for its organization, and whoever already answered it.
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
         or (e.organization_id is not null and public.speaks_for(e.organization_id))
         or private.member_sees_event(auth.uid(), e.id)
         or exists (
           select 1 from public.event_rsvps r
            where r.event_id = e.id and r.member_id = auth.uid()
         )
       )
  );
$$;

-- The link, for a private event, only for whoever can see it. As 20261101080000.
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
  more_photos jsonb,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text,
  takes_rsvps boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.description_html, e.start_time, e.end_time,
         e.all_day, e.timezone, e.location, e.city, e.state, e.event_format, e.url,
         e.registration_url, e.photo_path, e.photo_alt, e.more_photos,
         o.id, o.name, o.short_code, o.logo_path,
         e.feed_id is null or coalesce(o.collects_rsvps, false)
    from public.events e
    left join public.organizations o on o.id = e.organization_id and o.removed_at is null
   where e.id = event
     and (not private.event_is_private(e.audience) or public.can_see_event(e.id));
$$;

-- As 20261104202000, and no guest list for a private event from its link.
create or replace function public.register_for_event(
  event uuid, name text, email text, phone text, status text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  address text := public.normalize_email(email);
  cleaned_name text := btrim(coalesce(name, ''));
  cleaned_phone text := nullif(btrim(coalesce(phone, '')), '');
begin
  if not exists (
    select 1 from public.events e
     where e.id = event
       and coalesce(e.end_time, e.start_time) > now() - interval '1 day'
       and not private.event_is_private(e.audience)
  ) then
    raise exception 'This event is not taking registrations.' using errcode = '22023';
  end if;
  if status is null or status not in ('going', 'interested') then
    raise exception 'Choose Going or Interested.' using errcode = '22023';
  end if;
  if cleaned_name = '' or char_length(cleaned_name) > 100 then
    raise exception 'Add your name.' using errcode = '22023';
  end if;
  if address is null or not private.valid_email(address) then
    raise exception 'That does not look like an email address.' using errcode = '22023';
  end if;
  if cleaned_phone is not null and char_length(cleaned_phone) > 32 then
    raise exception 'That phone number is too long.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.event_registrations r
     where r.event_id = event and r.updated_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many registrations just now. Try again in a minute.' using errcode = 'P0001';
  end if;

  insert into public.event_registrations as r (event_id, name, email, phone, status)
  values (event, cleaned_name, address, cleaned_phone, status)
  on conflict (event_id, email) do update
    set name = excluded.name, phone = excluded.phone, status = excluded.status,
        updated_at = now();
end;
$$;

-- As 20261031060000: a private event's pictures are not public.
create or replace function public.event_cover_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name like 'events/%' and exists (
    select 1 from public.events e
     where (e.photo_path = object_name
            or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name)))
       and not private.event_is_private(e.audience)
  );
$$;

-- As 20261022180000, and who an organizations event is for when it is one.
-- Never who was invited.
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
  select e.audience, o.id, o.name, o.short_code, o.logo_path
    from public.events e
    left join public.organizations o
      on o.id = case
                  when e.audience = 'followers' then e.organization_id
                  when e.audience = 'organizations'
                       and (select count(*) from public.event_audience_organizations a
                             where a.event_id = e.id) = 1
                    then (select a.organization_id from public.event_audience_organizations a
                           where a.event_id = e.id)
                end
   where e.id = event
     and public.is_member()
     and not public.can_see_event(event);
$$;

-- A private event's chat is for its audience, whoever answered it, and
-- administrators, however they come to it (20261030000000 opened it to all).
create function private.event_chat_is_for_its_audience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attached uuid;
  hidden text;
begin
  select t.event_id into attached from public.chat_threads t where t.id = new.thread_id;
  if attached is null then
    return new;
  end if;
  select e.audience into hidden from public.events e where e.id = attached;
  if hidden is null or not private.event_is_private(hidden) then
    return new;
  end if;
  if private.member_sees_event(new.member_id, attached)
     or exists (select 1 from public.event_rsvps r
                 where r.event_id = attached and r.member_id = new.member_id)
     or exists (select 1 from public.members m where m.id = new.member_id and m.is_admin)
     or exists (select 1 from public.events e
                 where e.id = attached and e.organization_id is not null
                   and exists (select 1 from public.organization_representatives r
                                where r.organization_id = e.organization_id
                                  and r.member_id = new.member_id)) then
    return new;
  end if;
  raise exception 'There is no such event.' using errcode = 'P0002';
end;
$$;
revoke all on function private.event_chat_is_for_its_audience() from public, anon, authenticated;

create trigger chat_thread_members_event_audience
  before insert on public.chat_thread_members
  for each row execute function private.event_chat_is_for_its_audience();

-- A new date in a series takes the date before it's audience, all of it.
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
  insert into public.event_audience_organizations (event_id, organization_id)
  select new.id, a.organization_id from public.event_audience_organizations a
   where a.event_id = before_it
  on conflict do nothing;
  insert into public.event_invitees (event_id, member_id, invited_by)
  select new.id, i.member_id, i.invited_by from public.event_invitees i
   where i.event_id = before_it
  on conflict do nothing;
  return new;
end;
$$;

-- --------------------------------------------------------------- writing --
create function private.may_set_visibility(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.may_change_event(p_event) or exists (
    select 1 from public.events e
     where e.id = p_event
       and e.organization_id is not null
       and public.may_post_events_for(e.organization_id)
  );
$$;
revoke all on function private.may_set_visibility(uuid) from public, anon, authenticated;

create function public.set_event_visibility(
  p_event uuid,
  p_audience text,
  p_groups uuid[] default '{}',
  p_organizations uuid[] default '{}',
  p_people uuid[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.events%rowtype;
  groups uuid[] := '{}';
  orgs uuid[] := '{}';
  people uuid[] := '{}';
  bad uuid;
  dates uuid[];
  fresh uuid[] := '{}';
  batch timestamptz := clock_timestamp();
begin
  select * into target from public.events e where e.id = p_event;
  if not found or not private.may_set_visibility(p_event) then
    raise exception 'You cannot change who sees this event.' using errcode = '42501';
  end if;
  if p_audience is null or p_audience not in ('club', 'followers', 'groups', 'organizations', 'people') then
    raise exception 'Choose who can see the event.' using errcode = '22023';
  end if;
  if p_audience = 'followers' and target.organization_id is null then
    raise exception 'Only an organization''s event can be for its members.' using errcode = '22023';
  end if;

  if p_audience = 'groups' then
    select coalesce(array_agg(distinct g), '{}') into groups
      from unnest(coalesce(p_groups, '{}')) g where g is not null;
    if cardinality(groups) = 0 then
      raise exception 'Choose at least one group.' using errcode = '22023';
    end if;
    select g into bad from unnest(groups) g
     where not exists (
       select 1 from public.chat_threads t
        where t.id = g and t.kind = 'group'
          and (public.is_admin() or exists (
                select 1 from public.chat_thread_members m
                 where m.thread_id = t.id and m.member_id = me))
     ) limit 1;
    if bad is not null then
      raise exception 'One of those groups is not yours to choose.' using errcode = '42501';
    end if;
  elsif p_audience = 'organizations' then
    select coalesce(array_agg(distinct o), '{}') into orgs
      from unnest(coalesce(p_organizations, '{}')) o where o is not null;
    if cardinality(orgs) = 0 then
      raise exception 'Choose at least one organization.' using errcode = '22023';
    end if;
    if cardinality(orgs) > 20 then
      raise exception 'Choose 20 organizations at most.' using errcode = '22023';
    end if;
    select o into bad from unnest(orgs) o
     where not exists (
       select 1 from public.organizations x
        where x.id = o and x.removed_at is null
          and (public.is_admin() or public.speaks_for(x.id))
     ) limit 1;
    if bad is not null then
      raise exception 'You can choose only organizations you are an org admin of.' using errcode = '42501';
    end if;
  elsif p_audience = 'people' then
    select coalesce(array_agg(distinct p), '{}') into people
      from unnest(coalesce(p_people, '{}')) p where p is not null and p <> me;
    if cardinality(people) = 0 then
      raise exception 'Choose at least one person to invite.' using errcode = '22023';
    end if;
    if cardinality(people) > 500 then
      raise exception 'Invite 500 people at most.' using errcode = '22023';
    end if;
    select p into bad from unnest(people) p
     where not exists (select 1 from public.members m where m.id = p and m.status = 'active')
        or public.members_blocked(me, p)
     limit 1;
    if bad is not null then
      raise exception 'One of those members cannot be invited.' using errcode = 'P0002';
    end if;
  end if;

  -- This date, and in a series every later one.
  select coalesce(array_agg(e.id), '{}') into dates
    from public.events e
   where e.id = target.id
      or (target.series_id is not null and e.series_id = target.series_id
          and e.start_time >= target.start_time);

  select coalesce(array_agg(p), '{}') into fresh
    from unnest(people) p
   where not exists (select 1 from public.event_invitees i
                      where i.event_id = target.id and i.member_id = p);

  update public.events e set audience = p_audience, updated_at = now()
   where e.id = any (dates);

  delete from public.event_audience_groups g where g.event_id = any (dates);
  insert into public.event_audience_groups (event_id, thread_id)
  select d, g from unnest(dates) d cross join unnest(groups) g;

  delete from public.event_audience_organizations a where a.event_id = any (dates);
  insert into public.event_audience_organizations (event_id, organization_id)
  select d, o from unnest(dates) d cross join unnest(orgs) o;

  delete from public.event_invitees i
   where i.event_id = any (dates) and i.member_id <> all (people);
  insert into public.event_invitees (event_id, member_id, invited_by)
  select d, p, me from unnest(dates) d cross join unnest(people) p
  on conflict (event_id, member_id) do nothing;

  -- Tell whoever is newly invited, as an org admin's notice does
  -- (20261103000000): "<org> invited you to <event>".
  if cardinality(fresh) > 0 and coalesce(target.end_time, target.start_time) > now() then
    if target.organization_id is not null then
      insert into public.event_member_notices as x
        (event_id, member_id, organization_id, first_sent_at, last_sent_at)
      select target.id, f, target.organization_id, batch, batch from unnest(fresh) f
      on conflict (event_id, member_id)
      do update set last_sent_at = excluded.last_sent_at, sends = x.sends + 1;
    end if;
    insert into public.notifications as n
      (member_id, kind, tag, actor_id, event_id, organization_id, detail, created_at)
    select f, 'event_notice', 'notice:' || target.id::text, me, target.id,
           target.organization_id, null, batch
      from unnest(fresh) f
    on conflict (member_id, tag) where read_at is null
    do update set created_at = excluded.created_at, actor_id = excluded.actor_id,
                  detail = null, seen_at = null;
    perform public.push_notify_send(
      'event_notice', jsonb_build_object('event_id', target.id, 'batch', batch));
  end if;

  return cardinality(fresh);
end;
$$;
revoke all on function public.set_event_visibility(uuid, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.set_event_visibility(uuid, text, uuid[], uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------- reading --
-- Who a private event is for, for whoever can see it: the organizations by
-- name. The invite list and the groups only for whoever may change it.
create function public.event_visibility(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'audience', e.audience,
    'may_change', private.may_set_visibility(e.id),
    'organizations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
               order by o.name), '[]')
        from public.event_audience_organizations a
        join public.organizations o on o.id = a.organization_id
       where a.event_id = e.id),
    'groups', case when private.may_set_visibility(e.id) then (
      select coalesce(jsonb_agg(g.thread_id), '[]')
        from public.event_audience_groups g where g.event_id = e.id) end,
    'invitees', case when private.may_set_visibility(e.id) then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.display_name, 'username', m.username,
               'photo_path', m.photo_path) order by lower(m.display_name)), '[]')
        from public.event_invitees i
        join public.members m on m.id = i.member_id and m.status = 'active'
       where i.event_id = e.id) end,
    'invitee_count', (select count(*) from public.event_invitees i where i.event_id = e.id)
  )
    from public.events e
   where e.id = p_event and public.can_see_event(e.id);
$$;
revoke all on function public.event_visibility(uuid) from public, anon;
grant execute on function public.event_visibility(uuid) to authenticated;
