-- ============================================================================
-- Every event has a link to share
-- ============================================================================
-- The owner, 2026-10-29: "make it possible to share event links externally
-- for all events. We can remove the first option (anyone with a link) ...
-- The whole point of the link is for people to share it with the people they
-- want to invite to the event."
--
-- So the public page (public_event, 20261022180000) and its guest-list form
-- (register_for_event, 20261022190000) now answer for every event, whatever
-- its audience, and an event's cover is readable there too. The audience is
-- only who in the club sees it: everyone in the club, an organization's
-- followers, or chosen groups. The page still shows what an organization
-- would put on its own calendar, never who is going or how many.
--
-- 'public' goes as a choice: every public event becomes 'club', which is
-- what it read as inside the club, and is the default again (an imported
-- event sets no audience). A cached app that still sends 'public' is kept
-- right by the trigger below, rather than refused.
-- ============================================================================

alter table public.events alter column audience set default 'club';

update public.events set audience = 'club' where audience = 'public';

create or replace function private.event_audience_is_never_public()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.audience = 'public' then
    new.audience := 'club';
  end if;
  return new;
end;
$$;

create trigger event_audience_is_never_public
  before insert or update of audience on public.events
  for each row execute function private.event_audience_is_never_public();

-- -------------------------------------------------------- the public page --
-- As 20261022180000, for any event.
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
   where e.id = event;
$$;

-- Any event's cover, for the public page. Its path carries the event's
-- unguessable id, as the page's link does.
create or replace function public.event_cover_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.photo_path = object_name);
$$;

-- As 20261022190000, for any event.
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
    raise exception 'This event is not taking registrations.' using errcode = 'P0002';
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
    raise exception 'Too many registrations just now. Try again in a minute.' using errcode = '54000';
  end if;

  insert into public.event_registrations as r (event_id, name, email, phone, status)
  values (event, cleaned_name, address, cleaned_phone, status)
  on conflict (event_id, email) do update
    set name = excluded.name, phone = excluded.phone, status = excluded.status,
        updated_at = now();
end;
$$;
