-- ============================================================================
-- An organization's place has a ZIP code
-- ============================================================================
-- The owner, 2026-10-28: a location had no place for a ZIP code. It is
-- stored and shown, never part of the pin's lookup: geocode_key stays
-- address, city and state, so no found pin goes stale and nothing is asked
-- again, and the trigger of 20261025030000 does not fire on it.
--
-- save_organization_places is 20261025015000's, with the ZIP: five digits,
-- or ZIP+4. A place sent by id without the key keeps its ZIP, so an older
-- app's save does not clear it. Members read it as they read the address.
-- ============================================================================

alter table public.organization_places
  add column if not exists postal_code text
  check (postal_code is null or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$');

comment on column public.organization_places.postal_code is
  'US ZIP code (12345 or 12345-6789), as the organization''s own site gives it; not part of geocode_key.';

grant select (postal_code) on public.organization_places to anon, authenticated;

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
    if coalesce(btrim(place ->> 'postal_code'), '') !~ '^([0-9]{5}(-[0-9]{4})?)?$' then
      raise exception 'A ZIP code is five digits, or five, a dash and four.' using errcode = '22023';
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
             state = upper(btrim(place ->> 'state')),
             postal_code = case when place ? 'postal_code'
                                then nullif(btrim(place ->> 'postal_code'), '')
                                else op.postal_code end
       where op.id = (place ->> 'id')::uuid and op.organization_id = p_organization
      returning op.id into given;
    end if;
    if given is null then
      insert into public.organization_places (organization_id, position, label, address, city, state, postal_code)
      values (p_organization, i, nullif(btrim(place ->> 'label'), ''), nullif(btrim(place ->> 'address'), ''),
              btrim(place ->> 'city'), upper(btrim(place ->> 'state')),
              nullif(btrim(place ->> 'postal_code'), ''))
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
