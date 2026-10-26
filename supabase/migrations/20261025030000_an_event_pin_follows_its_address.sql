-- ============================================================================
-- A pin follows its address
-- ============================================================================
-- The owner, 2026-10-25: when an administrator or a host changes an event's
-- address, or adds an event by hand, its pin moves there within about a
-- minute; an organization's public address is placed the same way. Until
-- then the map shows the city's middle (20261025020000).
--
-- A place that no longer matches geocoded_location is queued, and the
-- `geocode-event` function is asked, as apple-revoke is (20261022160000):
--   geocode_event_url     where the function is. Absent, nothing is sent and
--                         the queue waits, so this is safe before the deploy.
--   geocode_event_secret  made here. geocodes_due checks it.
-- The function and the nightly import both take work from the same queue
-- (geocode_claim): one holder at a time, a claim outliving the longest run,
-- and nothing handed out within 1.1 seconds of the last lookup, so
-- Nominatim is asked at most once a second. Caps a day, so a loop of saves
-- cannot flood it: 5 per event or place, 3 per address text (a place saved
-- again as new), 20 per organization or adding member (more than any
-- organization's places), 500 for the club (several times a normal day).
-- An over-cap address stays at its city's middle and is tried the next day.
-- Without a state nothing is looked up: a match could be anywhere.
-- ============================================================================

create table if not exists private.geocode_queue (
  kind text not null check (kind in ('event', 'place')),
  target_id uuid not null,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  claimed_until timestamptz,
  claimed_query text,
  claimed_owner uuid,
  last_error text,
  primary key (kind, target_id)
);

comment on table private.geocode_queue is
  'Events and organization places whose address changed, waiting for a lookup. See 20261025030000.';

alter table private.geocode_queue enable row level security;
revoke all on private.geocode_queue from public, anon, authenticated, service_role;

-- Each lookup asked, for the caps and the spacing; kept two days.
create table if not exists private.geocode_lookups (
  kind text not null,
  target_id uuid not null,
  query text,
  owner_id uuid,
  asked_at timestamptz not null default clock_timestamp()
);

create index if not exists geocode_lookups_asked_idx on private.geocode_lookups (asked_at);

alter table private.geocode_lookups enable row level security;
revoke all on private.geocode_lookups from public, anon, authenticated, service_role;

-- Over a day's cap, counting lookups made and those claimed now.
create or replace function private.geocode_capped(p_kind text, p_target uuid, p_query text, p_owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with asked as (
    select l.kind, l.target_id, l.query, l.owner_id from private.geocode_lookups l
     where l.asked_at > now() - interval '1 day'
    union all
    select q.kind, q.target_id, q.claimed_query, q.claimed_owner from private.geocode_queue q
     where q.claimed_until > now()
  )
  select (select count(*) from asked a where a.kind = p_kind and a.target_id = p_target) >= 5
      or (select count(*) from asked a where a.query = p_query) >= 3
      or (p_owner is not null and (select count(*) from asked a where a.owner_id = p_owner) >= 20)
      or (select count(*) from asked) >= 500;
$$;

revoke all on function private.geocode_capped(text, uuid, text, uuid) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'geocode_event_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'geocode_event_secret',
      'Sent by geocode_send and checked by geocodes_due. Never leaves the database.'
    );
  end if;
end;
$$;

-- ------------------------------------------------------------- asking it --
create or replace function private.geocode_send()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  -- Once a transaction: a series of dates is one call.
  if current_setting('club.geocode_sent', true) = 'yes' then
    return;
  end if;
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'geocode_event_url';
  if target is null or target = '' then
    return;  -- not switched on yet: the queue waits
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'geocode_event_secret';
  perform net.http_post(
    url := target,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-geocode-secret', coalesce(secret, '')),
    timeout_milliseconds := 150000
  );
  perform set_config('club.geocode_sent', 'yes', true);
exception when others then
  raise warning 'geocode_send: %', sqlerrm;
end;
$$;

revoke all on function private.geocode_send() from public, anon, authenticated;

-- Never raises, so saving cannot fail here. The import's own writes are
-- placed by the import.
create or replace function private.geocode_queue_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_table_name = 'events' then
      if new.feed_id is not null and auth.role() = 'service_role' then
        return null;
      end if;
    end if;
    insert into private.geocode_queue (kind, target_id)
    values (case when tg_table_name = 'events' then 'event' else 'place' end, new.id)
    on conflict (kind, target_id) do update
      set queued_at = now(), attempts = 0, last_error = null;
    perform private.geocode_send();
  exception when others then
    raise warning 'geocode_queue_changed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.geocode_queue_changed() from public, anon, authenticated;

drop trigger if exists events_place_changed on public.events;
create trigger events_place_changed
  after insert or update of location, city, state, event_format on public.events
  for each row
  when (
    new.event_format is distinct from 'online'
    and new.state is not null
    and public.geocode_key(new.location, new.city, new.state) is not null
    and new.geocoded_location is distinct from public.geocode_key(new.location, new.city, new.state)
  )
  execute function private.geocode_queue_changed();

drop trigger if exists organization_places_address_changed on public.organization_places;
create trigger organization_places_address_changed
  after insert or update of address, city, state on public.organization_places
  for each row
  when (
    new.address is not null
    and new.geocoded_location is distinct from public.geocode_key(new.address, new.city, new.state)
  )
  execute function private.geocode_queue_changed();

-- ------------------------------------------------- what is looked up --
-- Every event and place with an address and a state, with what to ask and
-- whose day's cap it counts toward.
create or replace function private.geocode_targets()
returns table (kind text, target_id uuid, query text, state text, geocoded_location text,
               upcoming boolean, owner_id uuid)
language sql
stable
set search_path = ''
as $$
  select 'event', e.id, public.geocode_key(e.location, e.city, e.state), e.state, e.geocoded_location,
         coalesce(e.end_time, e.start_time) >= now() - interval '1 day',
         coalesce(e.organization_id, e.added_by)
    from public.events e
   where e.event_format is distinct from 'online' and e.state is not null
  union all
  select 'place', op.id, public.geocode_key(op.address, op.city, op.state), op.state, op.geocoded_location,
         true, op.organization_id
    from public.organization_places op
    join public.organizations o on o.id = op.organization_id and o.removed_at is null
   where op.address is not null;
$$;

revoke all on function private.geocode_targets() from public, anon, authenticated;

-- ------------------------------------------------------------ the claim --
-- Up to ten rows for four minutes, longer than the function's run; none
-- while anyone holds a claim or within 1.1 seconds of the last lookup.
create or replace function private.geocode_claim()
returns table (kind text, target_id uuid, query text, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  taken integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('geocode_claim'));
  delete from private.geocode_lookups l where l.asked_at < now() - interval '2 days';
  -- Placed since, gone, online, or emptied: nothing to look up.
  delete from private.geocode_queue q
   where not exists (
     select 1 from private.geocode_targets() g
      where g.kind = q.kind and g.target_id = q.target_id and g.query is not null
        and g.geocoded_location is distinct from g.query
   );
  if exists (select 1 from private.geocode_queue q where q.claimed_until > now())
     or exists (select 1 from private.geocode_lookups l where l.asked_at > clock_timestamp() - interval '1.1 seconds') then
    return;
  end if;
  for t in
    select q.kind, q.target_id, g.query, g.state, g.owner_id
      from private.geocode_queue q
      join private.geocode_targets() g on g.kind = q.kind and g.target_id = q.target_id
     where q.attempts < 3
     order by q.queued_at
  loop
    exit when taken >= 10;
    -- One request an address: its answer reaches every target with it.
    continue when exists (select 1 from private.geocode_queue c
                           where c.claimed_query = t.query and c.claimed_until > now());
    continue when private.geocode_capped(t.kind, t.target_id, t.query, t.owner_id);
    update private.geocode_queue q
       set attempts = q.attempts + 1, claimed_until = now() + interval '4 minutes',
           claimed_query = t.query, claimed_owner = t.owner_id
     where q.kind = t.kind and q.target_id = t.target_id;
    kind := t.kind; target_id := t.target_id; query := t.query; state := t.state;
    return next;
    taken := taken + 1;
  end loop;
end;
$$;

revoke all on function private.geocode_claim() from public, anon, authenticated;

-- ------------------------------------------------- what the function reads --
create or replace function public.geocodes_due(p_secret text)
returns table (kind text, target_id uuid, query text, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select s.decrypted_secret into expected
    from vault.decrypted_secrets s where s.name = 'geocode_event_secret';
  if p_secret is null or expected is null
     or extensions.digest(p_secret, 'sha256') <> extensions.digest(expected, 'sha256') then
    raise exception 'Not the database.' using errcode = '42501';
  end if;
  return query select * from private.geocode_claim();
end;
$$;

revoke all on function public.geocodes_due(text) from public, anon, authenticated;
grant execute on function public.geocodes_due(text) to service_role;

-- Written only while the place is still p_query, and to every other event
-- and place with the same address, so a series is placed by one request.
-- No coordinates is nowhere: the city's middle. An error keeps the row for
-- the next try. A call for a row still stale is a request asked, for the
-- caps and the spacing; one an earlier answer placed asked nothing.
create or replace function public.geocode_done(
  p_kind text,
  p_target uuid,
  p_query text,
  p_latitude double precision,
  p_longitude double precision,
  p_precision text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  placed boolean := false;
  owner uuid;
  stale boolean;
begin
  if p_kind is null or p_kind not in ('event', 'place') then
    raise exception 'An event or a place.' using errcode = '22023';
  end if;
  select g.owner_id, g.geocoded_location is distinct from p_query into owner, stale
    from private.geocode_targets() g
   where g.kind = p_kind and g.target_id = p_target;
  if coalesce(stale, true) then
    insert into private.geocode_lookups (kind, target_id, query, owner_id)
    values (p_kind, p_target, p_query, owner);
  end if;
  if p_error is null then
    if (p_latitude is null) <> (p_longitude is null)
       or (p_latitude is null) <> (p_precision is null)
       or p_precision not in ('exact', 'approximate') then
      raise exception 'A place is two coordinates and a precision, or none.' using errcode = '22023';
    end if;
    if p_kind = 'event' then
      update public.events e
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = p_precision, geocoded_location = p_query
       where e.id = p_target and e.state is not null
         and public.geocode_key(e.location, e.city, e.state) = p_query;
    else
      update public.organization_places op
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = p_precision, geocoded_location = p_query
       where op.id = p_target
         and public.geocode_key(op.address, op.city, op.state) = p_query;
    end if;
    placed := found;
    if placed then
      update public.events e
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = p_precision, geocoded_location = p_query
       where e.state is not null and e.event_format is distinct from 'online'
         and public.geocode_key(e.location, e.city, e.state) = p_query
         and e.geocoded_location is distinct from p_query;
      update public.organization_places op
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = p_precision, geocoded_location = p_query
       where op.address is not null
         and public.geocode_key(op.address, op.city, op.state) = p_query
         and op.geocoded_location is distinct from p_query;
    end if;
  end if;
  if placed then
    delete from private.geocode_queue q
     using private.geocode_targets() g
     where g.kind = q.kind and g.target_id = q.target_id
       and g.query = p_query and g.geocoded_location = p_query;
  else
    update private.geocode_queue q
       set claimed_until = null, claimed_query = null, claimed_owner = null,
           last_error = left(p_error, 500)
     where q.kind = p_kind and q.target_id = p_target;
  end if;
  return placed;
end;
$$;

revoke all on function public.geocode_done(text, uuid, text, double precision, double precision, text, text)
  from public, anon, authenticated;
grant execute on function public.geocode_done(text, uuid, text, double precision, double precision, text, text)
  to service_role;

-- -------------------------------------------------- the nightly backstop --
-- The import queues every upcoming event and place still stale, once a run,
-- then claims from the same queue as the function, under the same caps.
create or replace function public.geocodes_enqueue_stale()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into private.geocode_queue (kind, target_id)
  select g.kind, g.target_id from private.geocode_targets() g
   where g.query is not null and g.upcoming and g.geocoded_location is distinct from g.query
  on conflict (kind, target_id) do update
    set attempts = 0
    where private.geocode_queue.claimed_until is null or private.geocode_queue.claimed_until < now();
  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.geocodes_enqueue_stale() from public, anon, authenticated;
grant execute on function public.geocodes_enqueue_stale() to service_role;

create or replace function public.geocodes_claim_for_import()
returns table (kind text, target_id uuid, query text, state text)
language sql
security definer
set search_path = ''
as $$
  select * from private.geocode_claim();
$$;

revoke all on function public.geocodes_claim_for_import() from public, anon, authenticated;
grant execute on function public.geocodes_claim_for_import() to service_role;
