-- ============================================================================
-- An organization knows its state and its places
-- ============================================================================
-- The owner, 2026-10-25: an organization's city was matched to the map by
-- name alone, so More Than Walking's Stratford could land in California. Its
-- state now comes only from its own website; one that site does not confirm
-- stays null, off the map. Checked 2026-10-25.
--
-- California: the organizations of 20260910120050, 20260911290000 and
-- 20261021050000 whose city is plainly the California one, and these from
-- 20261021020000, by their own sites: ACS, CHN, LRO, NXS, TF, WWA, WLAX.
--
-- Elsewhere, each from the address on the organization's own site:
--   AA   CO  adaptiveadventures.org (Westminster, CO 80031)
--   ABY  AZ  ability360.org (page title "Ability360 | Phoenix, AZ")
--   ASNW OR  adaptivesportsnw.org (Portland OR 97216)
--   BLNK MD  blinkofaneye.org (Baltimore, MD 21210)
--   BLZ  GA  blazesports.org (Atlanta, GA 30318)
--   BOC  NY  usaboccia.org (Bay Shore, NY 11706)
--   BRPF WI  brpf.org (Waukesha, WI 53188)
--   CDRF NJ  christopherreeve.org (Short Hills, NJ 07078)
--   CH   CO  craighospital.org/contact (3425 S. Clarkson St., Englewood, CO
--            80113; the owner checked it in a browser)
--   DH   IL  diveheart.org/contact-us (5147 Main St, Downers Grove, IL 60181;
--            the owner checked it in a browser)
--   FD   IL  facingdisability.com (Chicago, IL 60611)
--   FFF  KS  fallingforward.org (Lawrence, KS 66049)
--   GBU  OH  gettingbackup.org/donate (Westlake, OH 44145)
--   HHL  PA  helphopelive.org (Radnor, PA 19087)
--   KBF  VT  kbf.org (Burlington, VT 05401)
--   LKS  AL  lakeshore.org (Birmingham, AL 35209)
--   MU   MD  moveunitedsport.org (Rockville, Maryland 20850)
--   NASC OH  nascic.org (Columbus, OH 43216)
--   NWBA CO  nwba.org/contactus (Colorado Springs, CO 80907)
--   PSOC IN  powersoccerusa.org/contact (Indianapolis, IN 46260)
--   PVA  DC  pva.org (Washington, DC 20006)
--   SHC  GA  shepherd.org (Atlanta, GA 30309)
--   SRA  IL  sralab.org (Chicago, IL 60611)
--   TESF MA  thomasesmithfoundation.org (Marblehead, MA 01945)
--   UNSP NY  unitedspinal.org (Fort Totten, NY 11359)
--   USH  CO  usahockey.com/staffdirectory (Colorado Springs, CO 80906)
--   USTA NY  usta.com, Contact Us (Purchase, NY 10577)
--
-- The owner's decisions: The Lionheart Community is in Sacramento, CA;
-- NextStep in Lawndale, Triumph in Valencia. Each organization's places,
-- and the states and cities they give, follow in 20261025040000.
--
-- Left null here: ReCARES, ParaCliffHangers, Wheel with Me (a region, not
-- a city), SCVMC (its site refused us; placed in 20261025040000), DRIVEN
-- Neuro (lists Indianapolis and Las Vegas, not Carmel), USA Wheelchair Rugby
-- and the US Wheelchair Rugby
-- Association (no location on their own sites; a fact-check found the
-- Birmingham address was Lakeshore's, from a directory), Ian Burkhart
-- Foundation, Project 34 and the National Wheelchair Softball Association
-- (no address of their own on their sites), and SPINALpedia (its address
-- only in markup a visitor never sees: the owner counts only what the page
-- shows). More Than Walking's donate page does show one, "155 Peace Acre
-- Ln., Stratford, CT 06614": its place and state come in 20261025040000.
--
-- organization_places holds each organization's places, the first its main
-- one; its city and state are copied to the organization when saved. Members
-- read them without coordinates, which only the map functions give.
-- Hand-added events with no state take their host's, or the saver's.
-- ============================================================================

alter table public.organizations
  add column if not exists state text check (state is null or state ~ '^[A-Z]{2}$');

comment on column public.organizations.state is
  'Two-letter US state, only as the organization''s own site gives it; null when not confirmed.';

update public.organizations o
   set state = v.state
  from (values
    ('CC', 'CA'), ('HF', 'CA'), ('NCS', 'CA'), ('BORP', 'CA'), ('SA', 'CA'), ('ACT', 'CA'),
    ('ACS', 'CA'), ('BAAD', 'CA'), ('CHN', 'CA'), ('TF', 'CA'), ('NT', 'CA'), ('LRO', 'CA'),
    ('NXS', 'CA'), ('WWA', 'CA'), ('WLAX', 'CA'),
    ('ARC', 'CA'), ('AFS', 'CA'), ('ACL', 'CA'), ('AMM', 'CA'), ('ACLA', 'CA'), ('ACSF', 'CA'),
    ('BWPV', 'CA'), ('BPF', 'CA'), ('BTB', 'CA'), ('CIL', 'CA'), ('CORE', 'CA'), ('CCAS', 'CA'),
    ('CHC', 'CA'), ('CSSD', 'CA'), ('ETC', 'CA'), ('KFRC', 'CA'), ('NCEF', 'CA'), ('OPS', 'CA'),
    ('POSS', 'CA'), ('PRC', 'CA'), ('PVAC', 'CA'), ('RLA', 'CA'), ('SVIL', 'CA'), ('SCAS', 'CA'),
    ('TRR', 'CA'), ('TPS', 'CA'), ('UNR', 'CA'), ('USRC', 'CA'), ('VAPA', 'CA'),
    ('LHC', 'CA'),
    ('AA', 'CO'), ('ABY', 'AZ'), ('ASNW', 'OR'), ('BLNK', 'MD'), ('BLZ', 'GA'),
    ('BOC', 'NY'), ('BRPF', 'WI'), ('CDRF', 'NJ'), ('CH', 'CO'), ('DH', 'IL'), ('FD', 'IL'),
    ('FFF', 'KS'), ('GBU', 'OH'), ('HHL', 'PA'), ('KBF', 'VT'), ('LKS', 'AL'), ('MU', 'MD'),
    ('NASC', 'OH'), ('NWBA', 'CO'), ('PSOC', 'IN'), ('PVA', 'DC'), ('SHC', 'GA'),
    ('SRA', 'IL'), ('TESF', 'MA'), ('UNSP', 'NY'), ('USH', 'CO'), ('USTA', 'NY')
  ) as v(short_code, state)
 where o.short_code = v.short_code;

update public.organizations o
   set city = v.city
  from (values ('LHC', 'Sacramento'), ('NXS', 'Lawndale'), ('TF', 'Valencia')) as v(short_code, city)
 where o.short_code = v.short_code;

-- ------------------------------------------------------- the editor saves it --
-- As 20261009020000, with the state: null keeps it (an older app), '' clears it.
drop function if exists public.save_organization(uuid, text, text, text, text, text[], boolean);
create or replace function public.save_organization(
  organization uuid, short_code text, name text, city text,
  description text, tags text[], can_invite boolean, state text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved uuid;
  previous_invite boolean;
  administrator boolean := public.is_admin();
  chosen text := nullif(upper(trim(save_organization.state)), '');
begin
  if organization is null then
    if not administrator then
      raise exception 'Only an administrator can add an organization.' using errcode = '42501';
    end if;
  else
    -- Lock the entry before deciding permission, including removal races.
    select o.can_invite into previous_invite from public.organizations o
      where o.id = organization and o.removed_at is null for update;
    if not found then
      raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
    end if;
    if not administrator and not (
      public.speaks_for(organization) and exists (
        select 1 from public.members where id = auth.uid() and type = 'organization' and status = 'active'
      )
    ) then
      raise exception 'You cannot change this organization.' using errcode = '42501';
    end if;
    if not administrator and can_invite is distinct from previous_invite then
      raise exception 'Only an administrator can change whether an organization vouches for members.' using errcode = '42501';
    end if;
  end if;
  if name is null or length(trim(name)) not between 1 and 300
    or city is null or length(trim(city)) not between 1 and 160
    or short_code is null or upper(trim(short_code)) !~ '^[A-Z]{2,4}$'
    or description is null or length(description) > 4000
    or tags is null or cardinality(tags) > 12
    or exists (select 1 from unnest(tags) tag where tag is null or length(trim(tag)) not between 1 and 80)
    or can_invite is null
    or chosen !~ '^[A-Z]{2}$' then
    raise exception 'Enter a name, place, two to four letter short code, and up to twelve tags.';
  end if;
  if organization is null then
    insert into public.organizations (short_code, name, city, description, tags, can_invite, state)
    values (upper(trim(short_code)), trim(name), trim(city), trim(description), tags, can_invite, chosen)
    returning id into saved;
  else
    update public.organizations o set short_code = upper(trim(save_organization.short_code)),
      name = trim(save_organization.name), city = trim(save_organization.city),
      description = trim(save_organization.description), tags = save_organization.tags,
      can_invite = save_organization.can_invite,
      state = case when save_organization.state is null then o.state else chosen end
     where o.id = organization returning o.id into saved;
    -- With places, the main one is the organization's place: the edit goes
    -- there too, and the directory keeps its state (a place has one).
    update public.organization_places op
       set city = trim(save_organization.city), state = coalesce(chosen, op.state)
     where op.organization_id = saved and op.position = 0;
    if found then
      update public.organizations o
         set state = (select op.state from public.organization_places op
                       where op.organization_id = saved and op.position = 0)
       where o.id = saved;
    end if;
  end if;
  return saved;
end;
$$;

revoke all on function public.save_organization(uuid, text, text, text, text, text[], boolean, text)
  from public, anon;
grant execute on function public.save_organization(uuid, text, text, text, text, text[], boolean, text)
  to authenticated;

-- ------------------------------------------------------------ its places --
create table public.organization_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position integer not null check (position between 0 and 49),
  label text check (label is null or length(label) between 1 and 80),
  address text check (address is null or length(address) between 1 and 200),
  city text not null check (length(btrim(city)) between 1 and 160),
  state text not null check (state ~ '^[A-Z]{2}$'),
  latitude double precision,
  longitude double precision,
  location_precision text check (location_precision in ('exact', 'approximate')),
  geocoded_location text,
  unique (organization_id, position) deferrable initially deferred
);

comment on table public.organization_places is
  'Where an organization is, main place first, from its own site. Coordinates only through the map. See 20261025015000.';

alter table public.organization_places enable row level security;
revoke all on public.organization_places from public, anon, authenticated;
-- Anon too, so the directory's embedded read never fails; no policy lets it
-- see a row.
grant select (id, organization_id, position, label, address, city, state)
  on public.organization_places to anon, authenticated;
grant select, insert, update, delete on public.organization_places to service_role;

create policy "members read organization places"
  on public.organization_places for select to authenticated
  using ((select public.is_member()));

-- Each organization with a state has its city as its main place until its
-- places are entered.
insert into public.organization_places (organization_id, position, city, state)
select o.id, 0, o.city, o.state from public.organizations o where o.state is not null;

-- Replaces the list, in order. A place sent with its id keeps its row, and
-- its pin while the address is the same. Whoever may edit the organization.
create or replace function public.save_organization_places(p_organization uuid, p_places jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place jsonb;
  i integer := 0;
  kept uuid[] := '{}';
  given uuid;
begin
  if not exists (select 1 from public.organizations o
                  where o.id = p_organization and o.removed_at is null) then
    raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
  end if;
  if not public.can_edit_organization(p_organization) then
    raise exception 'You cannot change this organization.' using errcode = '42501';
  end if;
  if p_places is null or jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) > 50 then
    raise exception 'Give up to fifty places.' using errcode = '22023';
  end if;
  for place in select value from jsonb_array_elements(p_places) loop
    if jsonb_typeof(place) <> 'object'
       or length(btrim(coalesce(place ->> 'city', ''))) not between 1 and 160
       or coalesce(upper(btrim(place ->> 'state')), '') !~ '^[A-Z]{2}$'
       or length(btrim(coalesce(place ->> 'label', ''))) > 80
       or length(btrim(coalesce(place ->> 'address', ''))) > 200 then
      raise exception 'Each place needs a city and a two-letter state; a label of 80 and an address of 200 characters at most.'
        using errcode = '22023';
    end if;
  end loop;

  for place in select value from jsonb_array_elements(p_places) loop
    given := null;
    if place ? 'id' and place ->> 'id' is not null then
      update public.organization_places op
         set position = i,
             label = nullif(btrim(place ->> 'label'), ''),
             address = nullif(btrim(place ->> 'address'), ''),
             city = btrim(place ->> 'city'),
             state = upper(btrim(place ->> 'state'))
       where op.id = (place ->> 'id')::uuid and op.organization_id = p_organization
      returning op.id into given;
    end if;
    if given is null then
      insert into public.organization_places (organization_id, position, label, address, city, state)
      values (p_organization, i, nullif(btrim(place ->> 'label'), ''), nullif(btrim(place ->> 'address'), ''),
              btrim(place ->> 'city'), upper(btrim(place ->> 'state')))
      returning id into given;
    end if;
    kept := kept || given;
    i := i + 1;
  end loop;

  delete from public.organization_places op
   where op.organization_id = p_organization and not (op.id = any (kept));

  -- The directory's place is the main one; with none, it is off the map.
  update public.organizations o
     set city = coalesce(m.city, o.city), state = m.state
    from (select (select op.city from public.organization_places op
                   where op.organization_id = p_organization and op.position = 0) as city,
                 (select op.state from public.organization_places op
                   where op.organization_id = p_organization and op.position = 0) as state) m
   where o.id = p_organization;
end;
$$;

revoke all on function public.save_organization_places(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_organization_places(uuid, jsonb) to authenticated;

-- -------------------------------------------- an event without a state --
-- Hand-added and calendar events: their series' state, the host's, its main
-- place's, then the saving member's. An imported event keeps the import's.
create or replace function private.event_takes_a_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not when a state is taken away on purpose (calendar_repair_events).
  if new.feed_id is null and new.state is null and new.event_format is distinct from 'online'
     and (tg_op = 'INSERT' or old.state is null) then
    new.state := coalesce(
      (select e.state from public.events e
        where new.series_id is not null and e.series_id = new.series_id and e.state is not null
        order by e.start_time limit 1),
      (select o.state from public.organizations o where o.id = new.organization_id),
      (select op.state from public.organization_places op
        where op.organization_id = new.organization_id and op.position = 0),
      (select m.state from public.members m where m.id = auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function private.event_takes_a_state() from public, anon, authenticated;

drop trigger if exists events_take_a_state on public.events;
create trigger events_take_a_state
  before insert or update of state, organization_id, event_format, location, city on public.events
  for each row execute function private.event_takes_a_state();

-- ------------------------------------------------- the event form's state --
-- As 20261005020000 and 20261011050000, with the state the form may give;
-- none keeps it (an older app), and the trigger above fills a new one.
drop function if exists public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text);
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
  registration text,
  state text default null
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
  clean_state text := nullif(upper(trim(coalesce(save_event.state, ''))), '');
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
  if clean_state is not null and clean_state !~ '^[A-Z]{2}$' then
    raise exception 'A state is its two letters.' using errcode = '22023';
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
      url, registration_url, organization_id, host_name, event_format, added_by, state
    )
    values (
      clean_title, clean_description, '', starts, ends, clean_place, clean_city,
      clean_link, clean_registration, organization, clean_host, format, me, clean_state
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
           state = coalesce(clean_state, e.state),
           updated_at = now()
     where e.id = event
    returning e.id into saved;
  end if;

  return saved;
end;
$$;

revoke all on function public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text)
  to authenticated;

drop function if exists public.save_event_series(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, integer, date, integer
);
create or replace function public.save_event_series(
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
  registration text,
  repeat_unit text,
  repeat_every integer,
  ends_on date,
  ends_after integer,
  state text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_id uuid;
  opener public.events%rowtype;
  new_series uuid;
  zone constant text := 'America/Los_Angeles';
begin
  if repeat_unit is null or repeat_unit not in ('day', 'week', 'month') then
    raise exception 'Say how often it repeats.' using errcode = '22023';
  end if;
  if repeat_every is null or repeat_every < 1 or repeat_every > 30 then
    raise exception 'It can repeat every 1 to 30 days, weeks or months.' using errcode = '22023';
  end if;
  if ends_on is not null and ends_after is not null then
    raise exception 'Say when it ends one way, not both.' using errcode = '22023';
  end if;
  if ends_after is not null and (ends_after < 2 or ends_after > 100) then
    raise exception 'It can repeat 2 to 100 times.' using errcode = '22023';
  end if;
  if ends_on is not null and starts is not null and ends_on <= (starts at time zone zone)::date then
    raise exception 'It has to end after the first date.' using errcode = '22023';
  end if;

  first_id := public.save_event(
    null, organization, host, title, description, starts, ends, format, place, city, link,
    registration, save_event_series.state
  );
  select * into opener from public.events e where e.id = first_id;

  insert into public.event_series (
    feed_id, series_key, title, repeat_unit, repeat_every, ends_on, ends_after,
    first_start, duration, next_index, made, template, added_by
  )
  values (
    null,
    'hand:' || first_id::text,
    opener.title,
    repeat_unit,
    repeat_every,
    ends_on,
    ends_after,
    opener.start_time,
    case when opener.end_time is null then null else opener.end_time - opener.start_time end,
    1,
    1,
    jsonb_build_object(
      'title', opener.title,
      'description', opener.description,
      'location', opener.location,
      'city', opener.city,
      'url', opener.url,
      'registration_url', opener.registration_url,
      'organization_id', opener.organization_id,
      'host_name', opener.host_name,
      'event_format', opener.event_format
    ),
    opener.added_by
  )
  returning id into new_series;

  update public.events e set series_id = new_series where e.id = first_id;
  perform public.extend_event_series(new_series);

  return first_id;
end;
$$;

revoke all on function public.save_event_series(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, integer, date, integer, text
) from public, anon;
grant execute on function public.save_event_series(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, integer, date, integer, text
) to authenticated;
