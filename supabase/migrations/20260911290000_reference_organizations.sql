-- ============================================================================
-- The wider SCI organizations, from ab-peers' own list
-- ============================================================================
-- ab-peers' events filter carried about two dozen organizations; this brings
-- across the ones that are real bodies rather than feed artefacts, with their
-- own logos.
--
-- ---------------------------------------------------------------------------
-- What these are, and what they are not
-- ---------------------------------------------------------------------------
-- Every one of them has `can_invite = false`, and most have no events in this
-- club's calendar — the ingest reads two California feeds, so a Denver hospital
-- or a Phoenix independent-living centre will not appear on it.
--
-- That is worth being clear about, because the Organizations tab currently ends
-- with "Organizations are one of the two ways a new member gets in", and eleven
-- of these cannot let anybody in and are not running anything a member can turn
-- up to this month. They are here as reference: Craig and Shepherd are the two
-- best-known SCI rehabilitation hospitals in the country, Reeve is the paralysis
-- resource everybody is eventually pointed at, and somebody newly injured has
-- a real reason to want their names in one place.
--
-- If that reads as directory bloat later, the fix is to split the tab — the
-- bodies that vouch and run events, and the ones worth knowing about — rather
-- than to delete the rows.
--
-- ---------------------------------------------------------------------------
-- Short codes are letters only
-- ---------------------------------------------------------------------------
-- `short_code ~ '^[A-Z]{2,4}$'` rejects digits, so Ability360 is ABY rather
-- than A360. The code is only ever the fallback when a logo is missing, and
-- every row here has one.
--
-- ---------------------------------------------------------------------------
-- Logos
-- ---------------------------------------------------------------------------
-- Each was pulled from that organization's own site and looked at in the badge
-- before being accepted (scripts/logos.mjs). Three candidates a scraper would
-- have taken were rejected on sight:
--
--   sralab.org's first icon is a "Best Hospitals — US News" award badge, not
--     the AbilityLab mark.
--   moveunitedsport.org's logo-ish images include four sponsor logos — Boeing,
--     The Hartford, Lockton, Veritas Capital.
--   triumph-foundation.org's header logo is white on transparent and renders
--     as an empty square, the same trap High Fives and ParaCliffHangers set.
--
-- Descriptions are deliberately one plain sentence of fact each. These are
-- other people's organizations and this file is not the place to write copy
-- about them.
-- ============================================================================

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, logo_path, aliases)
values
  ('ABY',  'Ability360', 'Phoenix',
   'Independent living centre running adaptive sports and community programmes for people with disabilities.',
   array['Adaptive sport', 'Independent living']::text[], false, 'organizations/aby.png', '{}'::text[]),

  ('ACT',  'Achieve Tahoe', 'Alpine Meadows',
   'Adaptive skiing, snowboarding and summer sport in the Tahoe basin.',
   array['Winter sports', 'Adaptive sport']::text[], false, 'organizations/act.png', '{}'::text[]),

  ('AA',   'Adaptive Adventures', 'Westminster',
   'Outdoor adaptive sport programmes — cycling, paddling and skiing — run across several states.',
   array['Outdoors', 'Adaptive sport']::text[], false, 'organizations/aa.jpg', '{}'::text[]),

  ('ACS',  'Angel City Sports', 'Los Angeles',
   'Year-round adaptive sport in Southern California, and the annual Angel City Games.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/acs.png', '{}'::text[]),

  ('BAAD', 'Bay Area Association of Disabled Sailors', 'San Francisco',
   'Sailing out of South Beach Harbor for people with disabilities, crewed and skippered by members.',
   array['Sailing', 'Water sports']::text[], false, 'organizations/baad.png', '{}'::text[]),

  ('CDRF', 'Christopher & Dana Reeve Foundation', 'Short Hills',
   'Paralysis research funding, and the Paralysis Resource Center — free information and peer support by phone.',
   array['Research', 'Advocacy', 'Resources']::text[], false, 'organizations/cdrf.png', '{}'::text[]),

  ('CH',   'Craig Hospital', 'Englewood',
   'Rehabilitation hospital specialising exclusively in spinal cord and brain injury.',
   array['Rehabilitation', 'Hospital']::text[], false, 'organizations/ch.png', '{}'::text[]),

  ('SHC',  'Shepherd Center', 'Atlanta',
   'Rehabilitation hospital specialising in spinal cord and brain injury.',
   array['Rehabilitation', 'Hospital']::text[], false, 'organizations/shc.png', '{}'::text[]),

  ('MU',   'Move United', 'Rockville',
   'National network of adaptive sport organizations, and the Paralympic sport body for community programmes.',
   array['Adaptive sport', 'Network']::text[], false, 'organizations/mu.png', '{}'::text[]),

  ('TF',   'Triumph Foundation', 'Santa Clarita',
   'Support, equipment and events for people with spinal cord injury in Southern California.',
   array['Peer support', 'Equipment']::text[], false, 'organizations/tf.png', '{}'::text[]),

  ('SRA',  'Shirley Ryan AbilityLab', 'Chicago',
   'Rehabilitation hospital and research centre; its Blackhawks programmes run adaptive team sport.',
   array['Rehabilitation', 'Hospital', 'Team sports']::text[], false, 'organizations/sra.png',
   -- Adaptive Rec Hub lists its sport programmes under the team's name.
   array['Abilitylab Blackhawks – Shirley Ryan']::text[])
on conflict (name) do nothing;

-- A fourth gym, from the same hub, spotted in ab-peers' own organization list.
update public.organizations
   set aliases = aliases || array['ParaCliffHangers – Diablo Rock Gym']::text[]
 where short_code = 'PCH'
   and not (aliases @> array['ParaCliffHangers – Diablo Rock Gym']::text[]);

-- Link anything already on file whose host now has a row.
update public.events e
   set organization_id = o.id
  from public.organizations o
 where e.organization_id is null
   and e.host_name is not null
   and (e.host_name = o.name or e.host_name = any (o.aliases));
