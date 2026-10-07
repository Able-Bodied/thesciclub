-- ============================================================================
-- Events added by hand
-- ============================================================================
-- The owner, 2026-10-05: administrators and organizations can add events
-- themselves. Until now the ingest was the only thing that made an event
-- (20260911180000 says "writes are service_role only"), so an organization
-- whose calendar the club does not scrape could not appear on it at all, and
-- nor could a meetup the club itself runs.
--
-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
--   An administrator: add an event for any organization in the directory, or
--     for none, naming the host in words ("self or community hosted", in the
--     owner's words); change or delete any hand-added event.
--   A member who speaks for an organization (20261005010000): add events for
--     that organization; change or delete hand-added events that are that
--     organization's. An event is the organization's, not the person's, so
--     anybody speaking for it may change it.
--   Nobody, in the app: change or delete a scraped event. The next run would
--     put it back, and the organization's own calendar is where it is wrong.
--
-- An organization's event goes live at once: the organization is in the
-- directory because somebody vouched for it, and its followers hear about it
-- from the daily notification the ingest's events already get (push_owed reads
-- events by created_at, so nothing changes there).
--
-- ---------------------------------------------------------------------------
-- A hand-added event has no feed
-- ---------------------------------------------------------------------------
-- feed_id and external_id were the ingest's dedup key, NOT NULL because every
-- event came from a feed. A hand-added event leaves both null, together. The
-- ingest reads and writes only `where feed_id = <its feed>`, so it never sees
-- one; null is distinct in the unique (feed_id, external_id), so they never
-- collide. A null feed is also how the app tells the two kinds apart.
--
-- Its times are read in Pacific, which is what the app and push_owed already
-- fall back to for an event with no feed's zone. Every organization that runs
-- events for the club is in California; the form says "Pacific time".
--
-- ---------------------------------------------------------------------------
-- What is left empty
-- ---------------------------------------------------------------------------
-- description_html (the plain description is what the detail shows when the
-- HTML is empty), coordinates and postal code (nobody geocodes a hand-added
-- event, so it is not found by distance, only by city), series and tags.
-- needs_pii_review is false: it records contact details in *scraped* copy, and
-- here a person wrote the words on purpose.
-- ============================================================================

alter table public.events
  alter column feed_id drop not null,
  alter column external_id drop not null;

alter table public.events
  drop constraint if exists events_feed_and_external_id_together;
alter table public.events
  add constraint events_feed_and_external_id_together
  check ((feed_id is null) = (external_id is null));

-- Who added it, for the record. Not granted to anon or authenticated: events
-- are public, and which member keyed one in is not.
alter table public.events
  add column if not exists added_by uuid references public.members (id) on delete set null;

comment on column public.events.added_by is
  'The member who added this event by hand. Null for a scraped event, or once that member is gone.';

-- A hand-added event says who hosts it: an organization, or a name.
alter table public.events
  drop constraint if exists events_hand_added_names_a_host;
alter table public.events
  add constraint events_hand_added_names_a_host
  check (
    feed_id is not null
    or organization_id is not null
    or length(trim(coalesce(host_name, ''))) > 0
  );

-- ------------------------------------------------------------------ helper
-- Whether the caller may add, change or delete hand-added events hosted by
-- this organization (null: hosted by none).
create or replace function public.may_post_events_for(organization uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin()
      or (organization is not null and public.speaks_for(organization));
$$;

revoke all on function public.may_post_events_for(uuid) from public, anon;
grant execute on function public.may_post_events_for(uuid) to authenticated;

-- ------------------------------------------------------------------- saving
-- One function for adding (event null) and changing. Every field is passed
-- every time, so a change is the whole form, as the form shows it.
create or replace function public.save_event(
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
  me uuid := auth.uid();
  existing public.events%rowtype;
  saved uuid;
  clean_title text := trim(coalesce(title, ''));
  clean_description text := trim(coalesce(description, ''));
  clean_host text := nullif(trim(coalesce(host, '')), '');
  clean_place text := trim(coalesce(place, ''));
  clean_city text := nullif(trim(coalesce(city, '')), '');
  clean_link text := nullif(trim(coalesce(link, '')), '');
  clean_registration text := nullif(trim(coalesce(registration, '')), '');
begin
  if me is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  if event is not null then
    select * into existing from public.events e where e.id = event for update;
    if not found then
      raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
    end if;
    if existing.feed_id is not null then
      raise exception 'This event comes from the organization''s own calendar, so it is changed there.'
        using errcode = '42501';
    end if;
    if not public.may_post_events_for(existing.organization_id) then
      raise exception 'You cannot change this event.' using errcode = '42501';
    end if;
  end if;

  if not public.may_post_events_for(organization) then
    raise exception '%',
      case when organization is null
        then 'Only an administrator can add an event no organization hosts.'
        else 'You cannot add events for that organization.'
      end
      using errcode = '42501';
  end if;
  if organization is not null then
    if not exists (select 1 from public.organizations o where o.id = organization) then
      raise exception 'That organization is not in the directory.' using errcode = 'P0002';
    end if;
    -- The organization is the host; a second name beside it would disagree.
    clean_host := null;
  elsif clean_host is null then
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
  -- A web address, and nothing a browser would run. The page draws both
  -- through safeHref anyway; this keeps anything else out of the table.
  if (clean_link is not null and clean_link !~* '^https?://[^\s]+$')
     or (clean_registration is not null and clean_registration !~* '^https?://[^\s]+$') then
    raise exception 'A link has to be a web address starting https://.' using errcode = '22023';
  end if;
  if length(coalesce(clean_link, '')) > 2000 or length(coalesce(clean_registration, '')) > 2000 then
    raise exception 'A link can be 2,000 characters at most.' using errcode = '22023';
  end if;

  if event is null then
    insert into public.events (
      title, description, description_html, start_time, end_time, location, city,
      url, registration_url, organization_id, host_name, event_format, added_by
    )
    values (
      clean_title, clean_description, '', starts, ends, clean_place, clean_city,
      clean_link, clean_registration, organization, clean_host, format, me
    )
    returning id into saved;
  else
    update public.events e
       set title = clean_title,
           description = clean_description,
           start_time = starts,
           end_time = ends,
           location = clean_place,
           city = clean_city,
           url = clean_link,
           registration_url = clean_registration,
           organization_id = organization,
           host_name = clean_host,
           event_format = format,
           updated_at = now()
     where e.id = event
    returning e.id into saved;
  end if;

  return saved;
end;
$$;

comment on function public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text) is
  'Adds (event null) or changes a hand-added event, for an administrator or a member who speaks for its organization.';

revoke all on function public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text)
  from public, anon;
grant execute on function public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text)
  to authenticated;

-- ----------------------------------------------------------------- deleting
-- RSVPs and tags go with it (on delete cascade). An event's group chat stays,
-- under the name it was given, with its link to the event cleared
-- (chat_threads.event_id is on delete set null): it is the members'
-- conversation, not the event's.
create or replace function public.delete_event(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if existing.feed_id is not null then
    raise exception 'This event comes from the organization''s own calendar, so it is changed there.'
      using errcode = '42501';
  end if;
  if not public.may_post_events_for(existing.organization_id) then
    raise exception 'You cannot delete this event.' using errcode = '42501';
  end if;

  delete from public.events e where e.id = event;
end;
$$;

comment on function public.delete_event(uuid) is
  'Deletes a hand-added event, for an administrator or a member who speaks for its organization.';

revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;
