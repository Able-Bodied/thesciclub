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
--   not: the Peers card and the profile a member sees (the owner: "I want the
--   about page to look just like the peers tab ... tap on the people and be
--   able to see their profile"). Never the city, state, birth date or age, or
--   the injury's month or day: the page blurs stand-ins for those
--   (src/routes/about/), so the real values never reach the browser. Nor the
--   phone, gender or marital status. Only active members.
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

-- One row per team member, shaped as browse_members' (src/lib/members.ts
-- BrowseMemberRow), so the page draws the Peers card and profile from it. The
-- city, state, age and injury date are null: injury_year carries the year.
-- Left out as well: phone, birth date, gender, marital status, and anything
-- the profile does not show.
create or replace function public.about_us_team()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'type', m.type,
    'display_name', m.display_name,
    'username', m.username::text,
    'photo_path', m.photo_path,
    'photo_alt', m.photo_alt,
    'avatar_color', m.avatar_color,
    'city', null,
    'state', '',
    'age', null,
    'injury_date', null,
    'injury_date_precision', m.injury_date_precision,
    'injury_year', extract(year from m.injury_date)::int,
    'level_range', m.level_range,
    'exact_level', m.exact_level,
    'injury_type', m.injury_type,
    'condition_name', m.condition_name,
    'completeness', m.completeness,
    'region', m.region,
    'how_injured', m.how_injured,
    'bio', m.bio,
    'detail', m.detail,
    'languages', m.languages,
    'independence', m.independence,
    'employment', m.employment,
    'field_of_work', m.field_of_work,
    'education', m.education,
    'has_children', m.has_children,
    'children_when', m.children_when,
    'interests', m.interests,
    'topics', m.topics,
    'self_care', m.self_care,
    'sports_equipment', m.sports_equipment,
    'grants', m.grants,
    'affiliations', m.affiliations,
    'is_seed', m.is_seed,
    'is_admin', m.is_admin,
    'created_at', m.created_at,
    -- As browse_members (20261028950000).
    'represented_organizations', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
               order by o.name, o.id)
        from public.organization_representatives r
        join public.organizations o on o.id = r.organization_id
       where r.member_id = m.id and o.removed_at is null
    ), '[]'::jsonb),
    'mentor_organizations', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
               order by o.is_the_club, o.name, o.id)
        from public.organization_mentors g
        join public.organizations o on o.id = g.organization_id
       where g.member_id = m.id and o.removed_at is null
    ), '[]'::jsonb)
  )
    from private.about_us_team t
    join public.members m on m.id = t.member_id
   where m.status = 'active'
   order by t.position, m.display_name;
$$;

revoke all on function public.about_us_team() from public;
grant execute on function public.about_us_team() to anon, authenticated;

comment on function public.about_us_team() is
  'The About us page: each team member as the Peers card and profile read them, without city, state, age or injury month and day. See 20261115150000.';

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
