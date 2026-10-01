-- The photos bucket takes 2MB at most, and only webp, JPEG and PNG.
--
-- The owner, 2026-09-30, for HOME-PLAN.md step 6, part 1. The chat bucket's
-- own numbers (20260918200000), on the bucket that holds every member
-- photograph (`<member_id>/…`), the seeded directory's (`seed/…`) and the
-- organizations' logos (`organizations/…`).
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 20260910120100 made `photos` with no size limit and no allowed types, so
-- storage took whatever it was handed. The app never needed it to: since
-- src/lib/image.ts a photograph is fitted to 800px and stored as webp, or as
-- JPEG where the browser cannot write webp. But the last resort there is the
-- original file — a browser that cannot draw the image at all sends what came
-- off the disk — and a client that is not this one sends anything. Before the
-- shrink existed the live bucket held 2.6MB originals; nothing here stopped a
-- 40MB file, a video, or an HTML page in a member's folder of a public bucket.
--
-- Now storage refuses those itself, for every role, the service key included.
-- The refusals carry "EntityTooLarge" and "InvalidMimeType", which
-- describeError already turns into sentences ("still too large after
-- shrinking", "not a kind of photograph the club can hold").
--
-- ---------------------------------------------------------------------------
-- What was there when this was written
-- ---------------------------------------------------------------------------
-- A limit does not delete a file already over it; it stops that file being
-- replaced. So the live bucket was listed through the storage API first, on
-- 2026-09-30: 49 files, the largest 329KB, 28 webp, 15 PNG and 6 JPEG.
-- Nothing over 2MB and nothing of another type, so nothing needed shrinking.
-- No organization logo is an SVG; `pnpm logos --upload` now says an SVG will
-- be refused, since an SVG is a document that can carry script and this
-- bucket is served to anyone with the link.
--
-- ---------------------------------------------------------------------------
-- What does not change
-- ---------------------------------------------------------------------------
-- `public` is left as it is: whether the bucket stays public is step 6, part
-- 2, and the owner's decision. The policies are untouched. An update rather
-- than the chat bucket's insert-on-conflict, because the bucket exists in
-- every project this runs on; if it did not, an update of no rows would leave
-- nothing half-made, and photo-cleanup.sql step 8 reads the row back.

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
 where id = 'photos';
