-- ============================================================================
-- An organization's event opens from its link; an invite-only one does not
-- ============================================================================
-- The owner, 2026-11-14: "public links should work if it is an event for an
-- organization. They may want to invite people that are not in the club.
-- This is a major growth vector", and for invite only, "There should be no
-- option for an external link. There should only be an option to invite",
-- the invite being a list of addresses or a spreadsheet, each with its own
-- link (20261114020000).
--
-- So an event for an organization's members (followers, organizations) is
-- in the club for those members, as before, and its page, guest list form
-- and pictures are open to anyone with the link again, as before
-- 20261106030000. Invite only stays closed to everyone but who is invited.
-- Somebody who registers from the link and joins sees it: an RSVP lets a
-- member see an event (can_see_event).
--
-- Its chat stays for its audience and whoever answered it
-- (event_chat_is_for_its_audience still asks event_is_private).
-- ============================================================================

create function private.event_link_is_closed(p_audience text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_audience = 'people';
$$;
revoke all on function private.event_link_is_closed(text) from public, anon, authenticated;

-- As 20261106030000, open to the link unless invite only.
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
     and (not private.event_link_is_closed(e.audience) or public.can_see_event(e.id));
$$;

-- As 20261106030000, taking registrations unless invite only.
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
       and not private.event_link_is_closed(e.audience)
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

-- As 20261106030000, pictures public unless invite only.
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
       and not private.event_link_is_closed(e.audience)
  );
$$;
