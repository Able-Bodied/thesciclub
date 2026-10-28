-- ============================================================================
-- Wheel With Me has no place
-- ============================================================================
-- The owner, 2026-10-27: Wheel With Me Foundation's own site
-- (wheelwithmefoundation.org: home, about, contact, events, grants) names no
-- city, region or state; "California" is only in its terms' and privacy
-- policy's boilerplate. The seed's "East Bay" goes: no city, no state, no
-- places, so it is off the map.
--
-- An organization's city may now be empty, as the owner's rule allows for one
-- whose site names no place. save_organization keeps an empty city as none;
-- the rest is 20261025015000's.
-- ============================================================================

alter table public.organizations alter column city drop not null;

update public.organizations set city = null, state = null where short_code = 'WWM';

delete from public.organization_places op
 using public.organizations o
 where o.id = op.organization_id and o.short_code = 'WWM';

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
  town text := nullif(trim(save_organization.city), '');
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
    or length(coalesce(town, '')) > 160
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
    values (upper(trim(short_code)), trim(name), town, trim(description), tags, can_invite, chosen)
    returning id into saved;
  else
    update public.organizations o set short_code = upper(trim(save_organization.short_code)),
      name = trim(save_organization.name), city = town,
      description = trim(save_organization.description), tags = save_organization.tags,
      can_invite = save_organization.can_invite,
      state = case when save_organization.state is null then o.state else chosen end
     where o.id = organization returning o.id into saved;
    -- With places, the main one is the organization's place: the edit goes
    -- there too, and the directory keeps its state (a place has one). A
    -- place keeps its city when the directory's is emptied.
    update public.organization_places op
       set city = coalesce(town, op.city), state = coalesce(chosen, op.state)
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
