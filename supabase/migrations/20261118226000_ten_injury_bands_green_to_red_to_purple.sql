-- ============================================================================
-- Ten bands of how long ago, green to red to dark purple
-- ============================================================================
-- The owner, 2026-11-18: "modify the pill color corresponding to the injury
-- age ... start from green and go to red. Also have more bands. <6 months,
-- 6-12 month, 1-2 years, 2-5 years, 5-10 years and then in 10 year
-- increments", then "green most junior to red most senior. Maybe actually
-- make red the color for 10 years post and then progress to a dark purple".
--
-- injury_band(date) is 0 to 9:
--   0 under 6 months   1 6-12 months   2 1-2 years   3 2-5 years
--   4 5-10 years       5 10-20 years   6 20-30       7 30-40
--   8 40-50            9 50 years and more
-- The pill's colour only; its words stay the five stages (injury_stage).
-- Like the stage it is sent whether or not the date is shown, so a hidden
-- date is now told to within its band.
--
-- Expand only (the iOS app may lag): injury_stage is kept as it is, and
-- injury_band goes at the end of browse_members and chat_authors (as
-- 20261117030000 and 20261117040000 but for it) and into about_us_team.
--
-- Probe: supabase/tests/ten-injury-bands.sql.
-- Undo: supabase/undo/20261118226000.sql.
-- ============================================================================

create or replace function public.injury_band(injured date) returns smallint
language sql
stable
set search_path = ''
as $$
  select case
    when injured is null then null
    when injured > current_date - interval '6 months' then 0
    when injured > current_date - interval '1 year' then 1
    when injured > current_date - interval '2 years' then 2
    when injured > current_date - interval '5 years' then 3
    when injured > current_date - interval '10 years' then 4
    when injured > current_date - interval '20 years' then 5
    when injured > current_date - interval '30 years' then 6
    when injured > current_date - interval '40 years' then 7
    when injured > current_date - interval '50 years' then 8
    else 9
  end::smallint;
$$;

-- Public, as the views call it as their reader; it reads nothing.
revoke all on function public.injury_band(date) from public;
grant execute on function public.injury_band(date) to authenticated, anon;

-- ----------------------------------------------------------- browse_members --
-- As 20261117030000, with injury_band at the end.
create or replace view public.browse_members with (security_barrier = true) as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.completeness,
  -- The date only where its member shows it, or to themselves (the owner,
  -- 2026-11-17); everybody else gets injury_stage, at the end.
  case when m.show_injury_date or m.id = auth.uid() then m.injury_date end as injury_date,
  case when m.show_injury_date or m.id = auth.uid() then m.injury_date_precision end as injury_date_precision,
  m.region,
  (extract(year from age(m.birth_date::timestamptz)))::integer as age,
  m.how_injured,
  m.bio,
  m.detail,
  m.gender,
  m.languages,
  m.independence,
  m.employment,
  m.field_of_work,
  m.education,
  m.education_when,
  m.marital_status,
  m.has_children,
  m.children_when,
  m.interests,
  m.topics,
  m.self_care,
  m.affiliations,
  m.wants_to_mentor,
  m.is_seed,
  m.is_admin,
  m.created_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.name, o.id)
      from public.organization_representatives r
      join public.organizations o on o.id = r.organization_id
     where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants,
  m.username::text as username,
  m.injury_type,
  m.condition_name,
  -- Inline, as represented_organizations: a function in a view runs as the
  -- reader, who may not read organization_mentors.
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.is_the_club, o.name, o.id)
      from public.organization_mentors g
      join public.organizations o on o.id = g.organization_id
     where g.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as mentor_organizations,
  public.injury_stage(m.injury_date) as injury_stage,
  public.injury_band(m.injury_date) as injury_band
from public.members m
where m.show_in_browse
  and m.status = 'active'
  and exists (
    select 1 from public.members viewer
     where viewer.id = auth.uid() and viewer.status = 'active'
  )
  and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  );

-- ------------------------------------------------------------- chat_authors --
-- As 20261117040000, with injury_band at the end.
create or replace view public.chat_authors with (security_barrier = true) as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  (m.show_in_browse and m.status = 'active' and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  )) as has_profile,
  m.username::text as username,
  m.injury_type,
  m.condition_name,
  public.injury_stage(m.injury_date) as injury_stage,
  public.injury_band(m.injury_date) as injury_band
from public.members m
where public.is_member();

-- ------------------------------------------------------------ about_us_team --
-- As 20261117030000, with injury_band.
create or replace function public.about_us_team()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    'injury_date_precision', case when m.show_injury_date then m.injury_date_precision end,
    'injury_year', case when m.show_injury_date then extract(year from m.injury_date)::int end,
    'injury_stage', public.injury_stage(m.injury_date),
    'injury_band', public.injury_band(m.injury_date),
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
