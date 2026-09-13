-- ============================================================================
-- The last logos, and three more organizations
-- ============================================================================
-- Five marks supplied by the owner, which closes every gap the web could not.
-- Santa Clara Valley's assets sit behind a WAF that refuses this machine on
-- every path, and Wheel With Me and Kelly Brush publish nothing square on their
-- own sites — so these were never going to come from a scraper, which is the
-- point of scripts/logos.mjs taking a file as readily as a URL.
--
-- Each was rendered into the badge at 96px and 38px before being accepted, the
-- same check every other logo went through. All five are square marks rather
-- than wordmarks and stay legible at card size.
--
-- ---------------------------------------------------------------------------
-- SCVMC finally has one
-- ---------------------------------------------------------------------------
-- The last organization on a short-code tile, and the one it mattered most for:
-- it is one of three that can put a phone number on the club's list, so it is
-- the worst one to show as two grey-gold letters. The diamond mark is used, not
-- the version with "SANTA CLARA VALLEY HEALTHCARE" beneath it — that one
-- shrinks to an illegible strip in a square, which is the problem this
-- migration also fixes for Wheel With Me.
--
-- ---------------------------------------------------------------------------
-- Wheel With Me swaps a wordmark for its mark
-- ---------------------------------------------------------------------------
-- 20260911270000 gave it the 5:1 pink wordmark off their site, which is legible
-- at 96px on the organization page and a coloured smudge at the 38px an event
-- card uses. The figure on its own is the same brand and survives the size.
-- The old file is left in the bucket rather than deleted; it is 36KB and
-- nothing points at it.
--
-- ---------------------------------------------------------------------------
-- Three more organizations
-- ---------------------------------------------------------------------------
-- Kelly Brush Foundation and The Lionheart Community come from ab-peers' list.
-- Adaptive Sports Northwest replaces "Disability Sports Northwest", which was
-- on that list and does not appear to exist under that name — the owner found
-- the right organization instead, so the wrong name is simply never added.
--
-- Turning Point Peer Network was on the list too and is deliberately left out:
-- it is not spinal-cord specific, and this club is (CONTEXT.md, "Spinal
-- cord injury only" — a constraint rather than a feature).
-- ============================================================================

update public.organizations
   set logo_path = 'organizations/sc.jpg'
 where short_code = 'SC';

update public.organizations
   set logo_path = 'organizations/wwm.jpg'
 where short_code = 'WWM';

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, logo_path, aliases)
values
  ('KBF',  'Kelly Brush Foundation', 'Burlington',
   'Grants that pay for adaptive sports equipment, and ski racing safety work, started after a collegiate racer''s spinal cord injury.',
   array['Adaptive sport', 'Equipment', 'Grants']::text[], false, 'organizations/kbf.png', '{}'::text[]),

  ('ASNW', 'Adaptive Sports Northwest', 'Portland',
   'Adaptive sport and recreation across the Pacific Northwest.',
   array['Adaptive sport', 'Recreation']::text[], false, 'organizations/asnw.jpg', '{}'::text[]),

  ('LHC',  'The Lionheart Community', 'Online',
   'A weekly online group for people journeying through paralysis — in-patients to experienced, quad to para, walking or rolling, and the people around them.',
   array['Peer support', 'Online', 'Weekly']::text[], false, 'organizations/lhc.jpg',
   -- NorCal SCI's calendar publishes their session under the group's own name.
   array['The Lionheart Community']::text[])
on conflict (name) do nothing;
