-- ============================================================================
-- The organizations already running events, added to the directory
-- ============================================================================
-- Events carried six host names with no organization row behind them, so the
-- Organizations tab listed six bodies while the Events tab showed nine. The
-- three that publish regularly are adopted here.
--
-- All three run events the club already lists. `can_invite` is false for every
-- one of them, which is the same posture as Canine Companions, High Fives and
-- ReCARES: a body can be worth showing on the calendar without being able to
-- put a phone number on the club's list. That flag is a human decision and
-- nothing here or in the ingest job may set it.
--
--   BORP Adaptive Sports   11 events   Berkeley
--   Shared Adventures       6 events   Santa Cruz
--   ParaCliffHangers        5 events   Bay Area
--
-- Not adopted: "Abilitylab Blackhawks – Shirley Ryan", one event. One event is
-- not a pattern, and the name is a visiting programme rather than a local
-- organization. It keeps its host_name, which is what that column is for.
--
-- ---------------------------------------------------------------------------
-- aliases: the names a feed uses, which are not always the name
-- ---------------------------------------------------------------------------
-- Adaptive Rec Hub names ParaCliffHangers once per venue —
-- "ParaCliffHangers – Berkeley Ironworks", "– Movement LIC", "– Pacific Pipe" —
-- so a feed that calls one organization three things would otherwise be three
-- organizations, or none.
--
-- An explicit list of strings rather than fuzzy matching, for the reason
-- jobs/event-ingest/ingest.js already gives: a near-match that is wrong credits
-- an event to a body that is not running it, and an organization's name is a
-- vouching signal here. Every entry below is a string somebody read.
--
-- The venue belongs in the event's location, not in the host's name, which is
-- why the organization is "ParaCliffHangers" and the three venues are aliases
-- of it rather than part of it.
--
-- Logos: pulled from each organization's own site and looked at in the badge
-- before being accepted (see scripts/logos.mjs). Two of the three candidates on
-- paracliffhangers.org are drawn for a dark header and render as an empty
-- square; the one used is their black line-art climber.
-- ============================================================================

alter table public.organizations
  add column if not exists aliases text[] not null default '{}';

comment on column public.organizations.aliases is
  'Other exact names a feed uses for this organization, matched by the ingest job alongside `name`. Curated strings only — never fuzzy-matched.';

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, logo_path, aliases)
values
  (
    'BORP', 'BORP Adaptive Sports', 'Berkeley',
    'Bay Area Outreach and Recreation Program. Fifty years of adaptive sport and recreation for people with physical disabilities and visual impairments — cycling, goalball, power soccer and wheelchair basketball.',
    array['Adaptive sport', 'Cycling', 'Team sports']::text[],
    false, 'organizations/borp.jpg', '{}'::text[]
  ),
  (
    'SA', 'Shared Adventures', 'Santa Cruz',
    'Outdoor recreation on the Santa Cruz coast for people with disabilities — kayaking, adaptive surfing and the annual Day on the Beach.',
    array['Outdoors', 'Water sports', 'Beach']::text[],
    false, 'organizations/sa.png', '{}'::text[]
  ),
  (
    'PCH', 'ParaCliffHangers', 'Bay Area',
    'Adaptive climbing sessions for people with disabilities, run at climbing gyms around the Bay Area.',
    array['Adaptive climbing', 'Indoor']::text[],
    false, 'organizations/pch.webp',
    -- The hub names this organization once per gym it runs at.
    array[
      'ParaCliffHangers – Berkeley Ironworks',
      'ParaCliffHangers – Movement LIC',
      'ParaCliffHangers – Pacific Pipe'
    ]::text[]
  )
on conflict (name) do nothing;

-- Link the events already on file. New ones are matched at ingest time.
update public.events e
   set organization_id = o.id
  from public.organizations o
 where e.organization_id is null
   and e.host_name is not null
   and (e.host_name = o.name or e.host_name = any (o.aliases));
