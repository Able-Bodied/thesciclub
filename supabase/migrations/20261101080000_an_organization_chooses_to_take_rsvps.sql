-- ============================================================================
-- An organization chooses whether its calendar's events take RSVPs
-- ============================================================================
-- The owner, 2026-11-01: an event made in the club, by hand or by a calendar
-- invite, takes RSVPs. One read from another calendar does so only if its org
-- admins say so, since nobody there is looking at the list otherwise. Without
-- that it has no RSVP button, only Interested, and Register where the host has
-- a sign-up of their own. Anybody already going stays going.
--
-- public_event is as 20261031060000, with takes_rsvps.
-- ============================================================================

alter table public.organizations
  add column collects_rsvps boolean not null default false;

comment on column public.organizations.collects_rsvps is
  'Its imported events take RSVPs too. Events made in the club always do. See 20261101080000.';

grant select (collects_rsvps) on public.organizations to anon, authenticated;

create function public.set_organization_collects_rsvps(
  p_organization uuid,
  p_collects boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can change this.' using errcode = '42501';
  end if;

  update public.organizations o
     set collects_rsvps = coalesce(p_collects, false)
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_organization_collects_rsvps(uuid, boolean) from public, anon;
grant execute on function public.set_organization_collects_rsvps(uuid, boolean) to authenticated;

drop function public.public_event(uuid);

create function public.public_event(event uuid)
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

revoke all on function public.public_event(uuid) from public;
grant execute on function public.public_event(uuid) to anon, authenticated;
