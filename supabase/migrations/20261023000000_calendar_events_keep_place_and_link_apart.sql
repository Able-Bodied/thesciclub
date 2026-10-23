-- ============================================================================
-- An event from a calendar invitation keeps its place and its link apart
-- ============================================================================
-- The owner, 2026-10-23, after a real Google Calendar invitation: the event's
-- place read "1 Hacker Wy, Menlo Park, CA 94025, USA; https://meet.google.com/…",
-- its link was empty, and it had no city where imported events show one.
-- calendar_make_event (20261022220000) took LOCATION whole.
--
-- calendar-inbound now sends the place, the link, the format, and the city and
-- state of a US address (place.ts). calendar_where reads the same out of an
-- older payload, and defends against a glued one: links out of the place,
-- a meeting link in it makes the event hybrid, and a city only from
-- "City, ST [ZIP][, USA]", never guessed.
--
-- Events already made from an invitation are repaired from their payloads by
-- calendar_repair_events, unless their place was changed by hand since. Safe
-- to run twice: a second run changes nothing.
-- ============================================================================

-- A state's code as written, or, with a ZIP or country beside it, its name.
create or replace function private.us_state_code(words text, named boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select s.code
    from (values
      ('AL','alabama'),('AK','alaska'),('AZ','arizona'),('AR','arkansas'),('CA','california'),
      ('CO','colorado'),('CT','connecticut'),('DE','delaware'),('DC','district of columbia'),
      ('FL','florida'),('GA','georgia'),('HI','hawaii'),('ID','idaho'),('IL','illinois'),
      ('IN','indiana'),('IA','iowa'),('KS','kansas'),('KY','kentucky'),('LA','louisiana'),
      ('ME','maine'),('MD','maryland'),('MA','massachusetts'),('MI','michigan'),
      ('MN','minnesota'),('MS','mississippi'),('MO','missouri'),('MT','montana'),
      ('NE','nebraska'),('NV','nevada'),('NH','new hampshire'),('NJ','new jersey'),
      ('NM','new mexico'),('NY','new york'),('NC','north carolina'),('ND','north dakota'),
      ('OH','ohio'),('OK','oklahoma'),('OR','oregon'),('PA','pennsylvania'),
      ('RI','rhode island'),('SC','south carolina'),('SD','south dakota'),
      ('TN','tennessee'),('TX','texas'),('UT','utah'),('VT','vermont'),('VA','virginia'),
      ('WA','washington'),('WV','west virginia'),('WI','wisconsin'),('WY','wyoming')
    ) as s(code, name)
   where s.code = words or (named and s.name = lower(words));
$$;

revoke all on function private.us_state_code(text, boolean) from public, anon, authenticated;

-- The city and state of a US address, as place.ts's cityOf; null otherwise.
create or replace function private.calendar_city(place text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[];
  words text[];
  n integer;
  w integer;
  named boolean := false;
  code text;
  city text;
begin
  select coalesce(array_agg(btrim(p) order by o), '{}') into parts
    from unnest(string_to_array(coalesce(place, ''), ',')) with ordinality u(p, o)
   where btrim(p) <> '';
  n := cardinality(parts);
  if n > 0 and parts[n] ~* '^(usa|us|u\.s\.a?\.?|united states( of america)?)$' then
    named := true; n := n - 1;
  end if;
  if n > 0 and parts[n] ~ '^\d{5}(-\d{4})?$' then
    named := true; n := n - 1;
  end if;
  if n = 0 then
    return null;
  end if;
  words := regexp_split_to_array(parts[n], '\s+');
  n := n - 1;
  w := cardinality(words);
  if words[w] ~ '^\d{5}(-\d{4})?$' then
    named := true; w := w - 1;
  end if;
  for take in reverse least(3, w)..1 loop
    code := private.us_state_code(array_to_string(words[w - take + 1 : w], ' '), named);
    continue when code is null;
    city := coalesce(nullif(array_to_string(words[1 : w - take], ' '), ''), parts[n], '');
    if city ~ '^[A-Za-z][A-Za-z .''-]{0,59}$' then
      return jsonb_build_object('city', city, 'state', code);
    end if;
    return null;
  end loop;
  return null;
end;
$$;

revoke all on function private.calendar_city(text) from public, anon, authenticated;

-- An invitation's place, link, format, city and state, from its payload.
create or replace function private.calendar_where(payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  url_re constant text := 'https?://[^\s;,<>"''()\[\]]+';
  meeting_re constant text :=
    '^https://([a-z0-9-]+\.)*(meet\.google\.com|zoom\.us|zoomgov\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)(/|$)';
  label_re constant text :=
    '^(microsoft teams( meeting)?|teams meeting|zoom( meeting)?|google meet|webex( meeting)?|online( meeting)?|virtual|video call)$';
  raw text := coalesce(payload ->> 'location', '');
  given text := nullif(btrim(coalesce(payload ->> 'url', '')), '');
  links text[];
  place text;
  link text;
  fmt text;
  found jsonb;
begin
  select coalesce(array_agg(regexp_replace(m[1], '[.:!?]+$', '') order by o), '{}') into links
    from regexp_matches(raw, '(' || url_re || ')', 'gi') with ordinality r(m, o);

  select coalesce(string_agg(piece, ', ' order by o), '') into place
    from (
      select o, regexp_replace(regexp_replace(p, '\s+', ' ', 'g'),
                               '^[\s,;|·–-]+|[\s,;|·–-]+$', '', 'g') as piece
        from regexp_split_to_table(regexp_replace(raw, url_re, '', 'gi'), '[;\n|]')
             with ordinality s(p, o)
    ) pieces
   where piece <> '' and piece !~* label_re;
  place := left(place, 300);

  if given !~* '^https?://\S+$' then
    given := null;
  end if;
  link := coalesce(
    (select l from unnest(links) with ordinality u(l, o) where l ~* meeting_re order by o limit 1),
    links[1],
    given);

  if place = '' then
    if link is not null
       or coalesce(payload ->> 'description', '') ~* '(meet\.google|zoom\.us|teams\.microsoft)' then
      fmt := 'online';
    else
      place := 'To be announced';
      fmt := 'in_person';
    end if;
  elsif payload ->> 'format' in ('in_person', 'hybrid') then
    fmt := payload ->> 'format';
  elsif exists (select 1 from unnest(links) l where l ~* meeting_re) then
    fmt := 'hybrid';
  else
    fmt := 'in_person';
  end if;

  if fmt <> 'online' then
    if payload ? 'city' then
      -- calendar-inbound's reading, if it is the address's own.
      if payload ->> 'state' ~ '^[A-Z]{2}$'
         and strpos(lower(place), lower(nullif(payload ->> 'city', ''))) > 0 then
        found := jsonb_build_object('city', payload ->> 'city', 'state', payload ->> 'state');
      end if;
    else
      found := private.calendar_city(place);
    end if;
  end if;

  return jsonb_build_object('place', place, 'link', link, 'format', fmt,
    'city', found ->> 'city', 'state', found ->> 'state');
end;
$$;

revoke all on function private.calendar_where(jsonb) from public, anon, authenticated;

-- As 20261022220000, with the place, link, format, city and state from calendar_where.
create or replace function private.calendar_make_event(payload jsonb, organization uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w jsonb := private.calendar_where(payload);
  made uuid;
  repeat jsonb := payload -> 'repeat';
begin
  if repeat is not null and jsonb_typeof(repeat) = 'object' then
    made := public.save_event_series(
      organization,
      case when organization is null then 'The SCI Club' end,
      payload ->> 'title',
      payload ->> 'description',
      (payload ->> 'starts')::timestamptz,
      (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', null,
      repeat ->> 'unit',
      (repeat ->> 'every')::integer,
      (repeat ->> 'endsOn')::date,
      (repeat ->> 'endsAfter')::integer
    );
  else
    made := public.save_event(
      null, organization,
      case when organization is null then 'The SCI Club' end,
      payload ->> 'title',
      payload ->> 'description',
      (payload ->> 'starts')::timestamptz,
      (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', null
    );
  end if;

  update public.events e
     set all_day = coalesce((payload ->> 'allDay')::boolean, false),
         timezone = nullif(payload ->> 'timezone', ''),
         state = w ->> 'state'
   where e.id = made or (e.series_id is not null and e.series_id = (
     select series_id from public.events where id = made));
  return made;
end;
$$;

revoke all on function private.calendar_make_event(jsonb, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ repair --
-- Each added invitation's event, every date of its series, and the series'
-- template for dates still to come. A place changed by hand is left alone.
-- Returns how many events changed; a second run changes none.
create or replace function private.calendar_repair_events()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  w jsonb;
  raw text;
  series uuid;
  changed integer;
  total integer := 0;
begin
  for r in
    select i.payload, i.event_id from public.calendar_invites i
     where i.state = 'added' and i.event_id is not null
  loop
    w := private.calendar_where(r.payload);
    raw := btrim(coalesce(r.payload ->> 'location', ''));
    select e.series_id into series from public.events e where e.id = r.event_id;

    update public.events e
       set location = w ->> 'place', url = w ->> 'link', event_format = w ->> 'format',
           city = w ->> 'city', state = w ->> 'state', updated_at = now()
     where (e.id = r.event_id or (series is not null and e.series_id = series))
       and e.feed_id is null
       and e.location in (raw, w ->> 'place', '', 'To be announced')
       and (e.location, e.url, e.event_format, e.city, e.state)
           is distinct from (w ->> 'place', w ->> 'link', w ->> 'format', w ->> 'city', w ->> 'state');
    get diagnostics changed = row_count;
    total := total + changed;

    update public.event_series s
       set template = s.template || jsonb_build_object('location', w ->> 'place',
             'url', w ->> 'link', 'event_format', w ->> 'format', 'city', w ->> 'city'),
           updated_at = now()
     where s.id = series
       and s.template ->> 'location' in (raw, w ->> 'place', '', 'To be announced')
       and (s.template ->> 'location', s.template ->> 'url', s.template ->> 'event_format',
            s.template ->> 'city')
           is distinct from (w ->> 'place', w ->> 'link', w ->> 'format', w ->> 'city');
  end loop;
  return total;
end;
$$;

revoke all on function private.calendar_repair_events() from public, anon, authenticated;

select private.calendar_repair_events();
