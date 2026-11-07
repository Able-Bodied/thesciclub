-- Undo for 20261106030000_private_events.sql. Each function as it was before.
-- A private event is not made public: one for chosen organizations or people
-- becomes its organization's members' (or, with no organization, nobody's
-- but its organizers'). The invite lists go. Deploy the web code without
-- set_event_visibility first.

update public.events
   set audience = case when organization_id is not null then 'followers' else 'groups' end
 where audience in ('organizations', 'people');

drop trigger if exists chat_thread_members_event_audience on public.chat_thread_members;
drop function if exists private.event_chat_is_for_its_audience();
drop function if exists public.event_visibility(uuid);
drop function if exists public.set_event_visibility(uuid, text, uuid[], uuid[], uuid[]);
drop function if exists private.may_set_visibility(uuid);

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
       )
  );
$$;

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
   where e.id = event;
$$;

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

create or replace function public.event_cover_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name like 'events/%' and exists (
    select 1 from public.events e
     where e.photo_path = object_name
        or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name))
  );
$$;


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

drop function if exists private.event_is_private(text);
drop table if exists public.event_invitees;
drop table if exists public.event_audience_organizations;

alter table public.events drop constraint events_audience_check;
alter table public.events add constraint events_audience_check
  check (audience in ('public', 'club', 'followers', 'groups'));
