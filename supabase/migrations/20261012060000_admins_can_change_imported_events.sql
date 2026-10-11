-- ============================================================================
-- An administrator can change an imported event
-- ============================================================================
-- The owner, 2026-10-11: administrators may change anything the event form
-- has on an event that came from an organization's calendar, and their
-- version wins until an administrator reverts it.
--
-- Until now save_event refused these: the ingest rewrites every imported row
-- from its calendar each night (jobs/event-ingest/ingest.js, an upsert on
-- feed_id, external_id), so a change made here would quietly be undone.
--
-- ---------------------------------------------------------------------------
-- Overrides live in the row, so everything reads the corrected event
-- ---------------------------------------------------------------------------
-- The event's own columns keep holding what members see — the corrected
-- title, the corrected time — so the event page, the list, the reminder the
-- night before and the daily follow notification all read the same thing
-- with no change of their own. Beside them:
--
--   admin_override  the fields an administrator changed, and their values;
--   feed_values     what the calendar says for exactly those fields.
--
-- The ingest (changed alongside this) puts an override back over what it
-- scraped for each overridden field, and records the scraped value in
-- feed_values; every other field keeps updating from the calendar. So if an
-- administrator fixed the title and the organization later moves the time,
-- members get the new time and the fixed title.
--
-- Only fields that actually differ from the calendar are kept as overrides:
-- saving the form with a field left as the calendar has it does not freeze
-- that field. Changing a field back to the calendar's value lets it go.
--
-- Reverting puts the calendar's values back at once from feed_values, and the
-- next import carries on as if nothing had been changed.
--
-- ---------------------------------------------------------------------------
-- The fields
-- ---------------------------------------------------------------------------
-- Those the form has: title, description, start and end, place and city,
-- format, the two links, and the host. A changed description also clears the
-- calendar's HTML for the event, because the page draws the HTML when there is
-- any and the administrator's words would otherwise not be seen; the HTML is
-- kept in feed_values and comes back on revert. The host is the organization
-- and, without one, a name, as save_event has it; an imported event keeps the
-- calendar's own name for its host beside a matched organization, and that is
-- left alone unless the organization is taken away.
--
-- Both new columns are public, as the rest of an event is: they hold event
-- details, not who changed them.
-- ============================================================================

alter table public.events
  add column if not exists admin_override jsonb,
  add column if not exists feed_values jsonb;

comment on column public.events.admin_override is
  'Imported events: fields an administrator changed, and their values. The ingest puts them back over what it scrapes.';
comment on column public.events.feed_values is
  'Imported events: what the calendar says for exactly the fields in admin_override. Kept current by the ingest; used to revert.';

grant select (admin_override, feed_values) on public.events to anon, authenticated;

-- --------------------------------------------------------------- changing

create or replace function public.admin_change_imported_event(
  event uuid,
  organization uuid,
  host text,
  title text,
  description text,
  starts timestamptz,
  ends timestamptz,
  format text,
  place text,
  city text,
  link text,
  registration text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  clean_title text := trim(coalesce(title, ''));
  clean_description text := trim(coalesce(description, ''));
  clean_host text := nullif(trim(coalesce(host, '')), '');
  clean_place text := trim(coalesce(place, ''));
  clean_city text := nullif(trim(coalesce(city, '')), '');
  clean_link text := nullif(trim(coalesce(link, '')), '');
  clean_registration text := nullif(trim(coalesce(registration, '')), '');
  baseline jsonb;
  desired jsonb;
  override jsonb := '{}'::jsonb;
  calendar jsonb := '{}'::jsonb;
  field text;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can change an imported event.' using errcode = '42501';
  end if;

  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if existing.feed_id is null then
    raise exception 'This event was added in the club; change it there.' using errcode = '22023';
  end if;

  -- The checks save_event makes, with its words.
  if organization is not null
     and not exists (select 1 from public.organizations o where o.id = organization) then
    raise exception 'That organization is not in the directory.' using errcode = 'P0002';
  end if;
  if organization is null and clean_host is null then
    raise exception 'Say who is hosting it.' using errcode = '22023';
  end if;
  if length(clean_title) = 0 then
    raise exception 'Give the event a name.' using errcode = '22023';
  end if;
  if length(clean_title) > 140 then
    raise exception 'The name can be 140 characters at most.' using errcode = '22023';
  end if;
  if length(clean_description) > 4000 then
    raise exception 'The description can be 4,000 characters at most.' using errcode = '22023';
  end if;
  if length(coalesce(clean_host, '')) > 120 then
    raise exception 'The host''s name can be 120 characters at most.' using errcode = '22023';
  end if;
  if length(clean_place) > 300 or length(coalesce(clean_city, '')) > 100 then
    raise exception 'The place is too long.' using errcode = '22023';
  end if;
  if starts is null then
    raise exception 'Say when it starts.' using errcode = '22023';
  end if;
  if ends is not null and ends <= starts then
    raise exception 'It has to end after it starts.' using errcode = '22023';
  end if;
  if format is null or format not in ('in_person', 'online', 'hybrid') then
    raise exception 'Say whether it is in person, online or hybrid.' using errcode = '22023';
  end if;
  if format <> 'online' and length(clean_place) = 0 then
    raise exception 'Say where it is.' using errcode = '22023';
  end if;
  if (clean_link is not null and clean_link !~* '^https?://[^\s]+$')
     or (clean_registration is not null and clean_registration !~* '^https?://[^\s]+$') then
    raise exception 'A link has to be a web address starting https://.' using errcode = '22023';
  end if;
  if length(coalesce(clean_link, '')) > 2000 or length(coalesce(clean_registration, '')) > 2000 then
    raise exception 'A link can be 2,000 characters at most.' using errcode = '22023';
  end if;

  -- What the calendar says for every field: the row, with the calendar's own
  -- value for any field already overridden.
  baseline := jsonb_build_object(
    'title', existing.title,
    'description', existing.description,
    'description_html', existing.description_html,
    'start_time', existing.start_time,
    'end_time', existing.end_time,
    'location', existing.location,
    'city', existing.city,
    'url', existing.url,
    'registration_url', existing.registration_url,
    'event_format', existing.event_format,
    'organization_id', existing.organization_id,
    'host_name', existing.host_name
  ) || coalesce(existing.feed_values, '{}'::jsonb);

  desired := jsonb_build_object(
    'title', clean_title,
    'description', clean_description,
    'start_time', starts,
    'end_time', ends,
    'location', clean_place,
    'city', clean_city,
    'url', clean_link,
    'registration_url', clean_registration,
    'event_format', format,
    'organization_id', organization,
    -- An organization is the host; the calendar's name for it stays as it is.
    'host_name', case when organization is not null then baseline -> 'host_name' else to_jsonb(clean_host) end
  );
  -- New words replace the calendar's formatting; the same words keep it.
  desired := desired || jsonb_build_object(
    'description_html',
    case when desired -> 'description' = baseline -> 'description'
      then baseline -> 'description_html' else to_jsonb(''::text) end
  );

  for field in select jsonb_object_keys(desired) loop
    if (desired -> field) is distinct from (baseline -> field) then
      override := override || jsonb_build_object(field, desired -> field);
      calendar := calendar || jsonb_build_object(field, baseline -> field);
    end if;
  end loop;
  -- Changed words always hold the formatting empty too, even when the
  -- calendar has none today: formatting it adds later would be drawn instead.
  if override ? 'description' and not override ? 'description_html' then
    override := override || jsonb_build_object('description_html', '');
    calendar := calendar || jsonb_build_object('description_html', baseline -> 'description_html');
  end if;

  update public.events e
     set title = desired ->> 'title',
         description = desired ->> 'description',
         description_html = desired ->> 'description_html',
         start_time = (desired ->> 'start_time')::timestamptz,
         end_time = (desired ->> 'end_time')::timestamptz,
         location = desired ->> 'location',
         city = desired ->> 'city',
         url = desired ->> 'url',
         registration_url = desired ->> 'registration_url',
         event_format = desired ->> 'event_format',
         organization_id = (desired ->> 'organization_id')::uuid,
         host_name = desired ->> 'host_name',
         admin_override = nullif(override, '{}'::jsonb),
         feed_values = nullif(calendar, '{}'::jsonb),
         updated_at = now()
   where e.id = event;

  return event;
end;
$$;

revoke all on function public.admin_change_imported_event(
  uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text
) from public, anon;
grant execute on function public.admin_change_imported_event(
  uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text
) to authenticated;

-- -------------------------------------------------------------- reverting

create or replace function public.admin_revert_imported_event(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  back jsonb;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can change an imported event.' using errcode = '42501';
  end if;
  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if existing.feed_id is null then
    raise exception 'This event was added in the club; change it there.' using errcode = '22023';
  end if;

  back := coalesce(existing.feed_values, '{}'::jsonb);
  update public.events e
     set title = case when back ? 'title' then back ->> 'title' else e.title end,
         description = case when back ? 'description' then back ->> 'description' else e.description end,
         description_html = case when back ? 'description_html' then back ->> 'description_html' else e.description_html end,
         start_time = case when back ? 'start_time' then (back ->> 'start_time')::timestamptz else e.start_time end,
         end_time = case when back ? 'end_time' then (back ->> 'end_time')::timestamptz else e.end_time end,
         location = case when back ? 'location' then back ->> 'location' else e.location end,
         city = case when back ? 'city' then back ->> 'city' else e.city end,
         url = case when back ? 'url' then back ->> 'url' else e.url end,
         registration_url = case when back ? 'registration_url' then back ->> 'registration_url' else e.registration_url end,
         event_format = case when back ? 'event_format' then back ->> 'event_format' else e.event_format end,
         organization_id = case when back ? 'organization_id' then (back ->> 'organization_id')::uuid else e.organization_id end,
         host_name = case when back ? 'host_name' then back ->> 'host_name' else e.host_name end,
         admin_override = null,
         feed_values = null,
         updated_at = now()
   where e.id = event;
end;
$$;

revoke all on function public.admin_revert_imported_event(uuid) from public, anon;
grant execute on function public.admin_revert_imported_event(uuid) to authenticated;
