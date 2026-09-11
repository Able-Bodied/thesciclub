-- ============================================================================
-- Logos for the rest of the organizations
-- ============================================================================
-- 20260911260000 put NorCal SCI's mark in the bucket and left the other five on
-- the short-code tile, because guessing at a CDN path for somebody else's logo
-- produces a broken image that reads as a bug here.
--
-- They are no longer guesses. Each was taken from that organization's own site
-- and looked at — rendered into the badge at both 96px and the real 38px, on
-- the gold tile, before being accepted. That check is the reason two obvious
-- candidates were rejected:
--
--   High Fives publishes a horizontal logo in white, for their dark header. On
--   the badge's white ground it renders as an empty square. Their orange shield
--   favicon is used instead.
--
--   Canine Companions' header logo is a wordmark 183px wide and 68 tall, which
--   letterboxes into a thin strip in a square. Their app icon — the blue
--   line-art dog and handler — fills it and is the mark people recognise.
--
-- Where an organization publishes a square app icon, that is what is used. A
-- wide wordmark is legible on the organization page at 66px and close to a
-- coloured smudge on a 38px card badge, which is a fact about wordmarks rather
-- than something this schema can fix.
--
-- ---------------------------------------------------------------------------
-- SCVMC is still on its short code, deliberately
-- ---------------------------------------------------------------------------
-- Santa Clara Valley Medical Center is a county hospital and its assets are
-- behind Cloudflare on files.santaclaracounty.gov, which refuses direct
-- requests. It let one page load through and then started challenging, and
-- repeatedly probing a hospital's edge to get a PNG is not a reasonable thing
-- to do to them.
--
-- The alternative — taking a copy from a logo aggregator — is exactly the risk
-- worth avoiding: an out-of-date or reconstructed mark on the organization that
-- vouches for members is worse than no mark. It stays on SC until somebody can
-- hand over the file, which is thirty seconds of work for anybody with a
-- browser already signed in there.
--
-- Sources, recorded here because this is where somebody refreshing them looks:
--   CC  https://canine.org/wp-content/uploads/2021/05/cropped-android-chrome-512x512-1-192x192.png
--   HF  https://highfivesfoundation.org/wp-content/uploads/2020/10/cropped-high-fives-foundation-favicon-1-192x192.png
--   RC  the site icon of https://www.recares.org/ (Google Sites)
--   WWM https://cdn.qikcms.com/wheelwm-foundation/photos/4fNMkHteKTFe5XioCqjwYeVPwqO1tZYIBeVBUw5t.png
-- ============================================================================

update public.organizations as o
   set logo_path = v.path
  from (values
  ('CC',  'organizations/cc.png'),
  ('HF',  'organizations/hf.png'),
  ('RC',  'organizations/rc.png'),
  ('WWM', 'organizations/wwm.png')
) as v(short_code, path)
 where o.short_code = v.short_code
   and o.logo_path is null;
