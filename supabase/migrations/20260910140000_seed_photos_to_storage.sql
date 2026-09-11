-- ============================================================================
-- Seed photos: off NorCal SCI's CDN, into our own bucket
-- ============================================================================
-- The seeded rows shipped with `photo_url` pointing at
-- images.squarespace-cdn.com — NorCal SCI's own site. That worked, and it was
-- never right: it serves our app from their bandwidth, and it breaks the day
-- they reorganize their media library. All 23 images are now in the `photos`
-- bucket under `seed/`.
--
-- ---------------------------------------------------------------------------
-- Why the column becomes a path, not a URL
-- ---------------------------------------------------------------------------
-- A full public URL embeds the project ref
-- (https://<ref>.supabase.co/storage/v1/object/public/photos/...), so seeding a
-- second project — staging, or a replacement — would write rows pointing at the
-- first project's storage. Storing the bucket-relative path instead keeps the
-- data portable, and the client composes the URL from whichever project it is
-- talking to. It is also the shape Supabase's own `getPublicUrl(path)` expects.
--
-- Renaming rather than adding a column: there are no real members yet, so there
-- is nothing to migrate, and leaving a `photo_url` that holds a path would be a
-- name that lies.
--
-- ---------------------------------------------------------------------------
-- A note on the files themselves
-- ---------------------------------------------------------------------------
-- Every source URL ended in .jpg, .JPG or .png; every one of them actually
-- served image/webp, because Squarespace's resizer converts on the fly. The
-- extensions here come from the response Content-Type, not from the URL.
-- ============================================================================

alter table public.members rename column photo_url to photo_path;

comment on column public.members.photo_path is
  'Path within the public `photos` bucket, e.g. seed/<id>.webp. Not a URL — the client composes one.';

update public.members as m
   set photo_path = v.path
  from (values
  ('c85c10bf-0226-394f-8c91-2a2ffc40a147', 'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp'),
  ('d49fe7d1-73df-41c5-50ef-29ce445b6bd9', 'seed/d49fe7d1-73df-41c5-50ef-29ce445b6bd9.webp'),
  ('43bb63c6-939e-461e-264c-4b2a817beb91', 'seed/43bb63c6-939e-461e-264c-4b2a817beb91.webp'),
  ('bc62c2b7-dc4f-3146-e5cf-c453023ad22f', 'seed/bc62c2b7-dc4f-3146-e5cf-c453023ad22f.webp'),
  ('11712b50-bf2e-3c6b-f736-250e96e6987f', 'seed/11712b50-bf2e-3c6b-f736-250e96e6987f.webp'),
  ('f2851f46-8fc1-ab8d-842c-33b7ceaccc9d', 'seed/f2851f46-8fc1-ab8d-842c-33b7ceaccc9d.webp'),
  ('d1ce8fad-f0c3-3b98-a006-9f19e6024067', 'seed/d1ce8fad-f0c3-3b98-a006-9f19e6024067.webp'),
  ('2bae42ae-8699-c6ba-3cb2-81b345ee504a', 'seed/2bae42ae-8699-c6ba-3cb2-81b345ee504a.webp'),
  ('bd3974e7-625a-3bc1-cd45-91523eef6e3c', 'seed/bd3974e7-625a-3bc1-cd45-91523eef6e3c.webp'),
  ('c5a7cc04-f040-60a7-7f18-5bdabd046ade', 'seed/c5a7cc04-f040-60a7-7f18-5bdabd046ade.webp'),
  ('83a2c92f-8099-caef-b987-bac63ef13bd4', 'seed/83a2c92f-8099-caef-b987-bac63ef13bd4.webp'),
  ('717f39d4-5aae-0836-dcf5-9bdbc55cf3b2', 'seed/717f39d4-5aae-0836-dcf5-9bdbc55cf3b2.webp'),
  ('0da2c170-5e86-315e-b3e1-a54b43b7a45a', 'seed/0da2c170-5e86-315e-b3e1-a54b43b7a45a.webp'),
  ('ec2d4f08-df45-2ea8-58fb-be791ef09ef2', 'seed/ec2d4f08-df45-2ea8-58fb-be791ef09ef2.webp'),
  ('4df177ee-e1f0-c47e-9e03-fe9473651a86', 'seed/4df177ee-e1f0-c47e-9e03-fe9473651a86.webp'),
  ('de265880-f900-55e1-dd5a-4cd8b0df72c0', 'seed/de265880-f900-55e1-dd5a-4cd8b0df72c0.webp'),
  ('17c29016-7180-e835-4503-3f8898b06b8b', 'seed/17c29016-7180-e835-4503-3f8898b06b8b.webp'),
  ('ee7c2dfe-6203-df03-77f2-03e81a33bef0', 'seed/ee7c2dfe-6203-df03-77f2-03e81a33bef0.webp'),
  ('5c81cd57-47f7-0096-c2fa-80dde9a8ce08', 'seed/5c81cd57-47f7-0096-c2fa-80dde9a8ce08.webp'),
  ('4574f3e5-f615-d38a-80ba-2fef00000ade', 'seed/4574f3e5-f615-d38a-80ba-2fef00000ade.webp'),
  ('9e79bac7-c43a-05b0-930e-2402417bdbf5', 'seed/9e79bac7-c43a-05b0-930e-2402417bdbf5.webp'),
  ('ccaae582-c2e5-14f8-a97d-bb501693acd7', 'seed/ccaae582-c2e5-14f8-a97d-bb501693acd7.webp'),
  ('9c66fd75-0c36-cdbb-880a-e52b5ae6b75b', 'seed/9c66fd75-0c36-cdbb-880a-e52b5ae6b75b.webp')
  ) as v(id, path)
 where m.id = v.id::uuid;

-- The view has to be rebuilt: it named the old column.
drop view if exists public.browse_members;


create view public.browse_members as
select
  id,
  type,
  display_name,
  photo_path,
  photo_alt,
  avatar_color,
  city,
  state,
  level_range,
  exact_level,
  completeness,
  injury_date,
  injury_date_precision,
  region,
  -- Age, derived on read. A stored age is wrong within a year, and birth_date
  -- itself never crosses this boundary.
  extract(year from age(birth_date))::int as age,
  how_injured,
  bio,
  detail,
  gender,
  languages,
  independence,
  employment,
  field_of_work,
  education,
  education_when,
  marital_status,
  has_children,
  children_when,
  interests,
  topics,
  self_care,
  affiliations,
  wants_to_mentor,
  is_seed,
  created_at
from public.members
where show_in_browse
  and status = 'active';

revoke all on public.browse_members from anon;
revoke all on public.browse_members from public;

grant select on public.browse_members to authenticated;
