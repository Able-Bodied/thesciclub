-- ============================================================================
-- About us: the members building the club, for anybody to see
-- ============================================================================
-- The owner, 2026-11-15: "Can we create an about us page for public display
-- for the members of theSCIClub explaining these are the people working on
-- building this app. Blur out the city, age, injury month/date." Then: "Add
-- Chandler, Erik and Myles."
--
-- * private.about_us_team: who is on the page, in order. Its own list, not the
--   admin flag: being on the page and holding admin powers are different
--   things. Changed by hand (insert or delete a row).
-- * public.about_us_team(): what the page shows, for anybody, signed in or
--   not. Only the name, photo, mentor or peer, and the injury's level, kind,
--   completeness and year. Never the city, state, region, birth date or age,
--   the injury's month or day, the bio or anything else on the profile: the
--   page blurs stand-ins for the hidden ones (src/routes/about/page.tsx), so
--   the real values never reach the browser. Only active members.
-- * Their photos (and the small copies) can be read without an account, as a
--   public event's cover can (20261114050000).
-- ============================================================================

create table if not exists private.about_us_team (
  member_id uuid primary key references public.members (id) on delete cascade,
  position int not null default 100
);

comment on table private.about_us_team is
  'The members shown on the public About us page, in order. See 20261115150000.';

revoke all on private.about_us_team from public, anon, authenticated;

-- The live club's team; ids not in a project are skipped.
insert into private.about_us_team (member_id, position)
select m.id, t.position
  from (values
    ('34a91e44-9027-4a2a-8b16-e20a97f87895'::uuid, 10), -- Alfred Shaheen
    ('c32b76fe-6db4-44bc-8f04-a71b31688ef3'::uuid, 20), -- Wojtek
    ('67a08283-3fde-4b97-9d18-1d7e181f93ed'::uuid, 30), -- Ajay
    ('e792ab77-ee8d-4aee-8bfe-5b97b83ec81f'::uuid, 40), -- Ran
    ('4fbeb6f6-4b88-461b-8d04-169325a392ec'::uuid, 50), -- Erik Hjeltnes
    ('af759b54-15ad-4088-b974-f0718f7718c1'::uuid, 60), -- Myles
    ('6e42f7bd-fcb3-4f7d-a4d0-824d5cb706c7'::uuid, 70)  -- Chandler Barnes
  ) as t (member_id, position)
  join public.members m on m.id = t.member_id
on conflict (member_id) do nothing;

create or replace function public.about_us_team()
returns table (
  id uuid,
  display_name text,
  type text,
  photo_path text,
  photo_alt text,
  level_range text,
  exact_level text,
  completeness text,
  injury_type text,
  condition_name text,
  injury_year int,
  injury_date_precision text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.display_name, m.type::text, m.photo_path, m.photo_alt,
         m.level_range::text, m.exact_level::text, m.completeness::text,
         m.injury_type::text, m.condition_name,
         extract(year from m.injury_date)::int, m.injury_date_precision::text
    from private.about_us_team t
    join public.members m on m.id = t.member_id
   where m.status = 'active'
   order by t.position, m.display_name;
$$;

revoke all on function public.about_us_team() from public;
grant execute on function public.about_us_team() to anon, authenticated;

comment on function public.about_us_team() is
  'The About us page: name, photo, role and injury level and year of each team member. No city, age or injury month and day. See 20261115150000.';

-- A team member's photo or its small copy (photos.ts thumbPath: ".thumb"
-- before the extension).
create or replace function public.about_us_photo_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.about_us_team t
      join public.members m on m.id = t.member_id
     where m.status = 'active'
       and m.photo_path is not null
       and object_name in (
         m.photo_path,
         regexp_replace(m.photo_path, '(\.[^./]+)$', '.thumb\1'),
         m.photo_path || '.thumb'
       )
  );
$$;

revoke all on function public.about_us_photo_is_public(text) from public;
grant execute on function public.about_us_photo_is_public(text) to anon, authenticated;

drop policy if exists "anyone reads the about-us team's photos" on storage.objects;
create policy "anyone reads the about-us team's photos"
  on storage.objects for select
  to anon
  using (bucket_id = 'photos' and public.about_us_photo_is_public(name));
