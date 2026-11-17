-- Injury dates are hidden unless their member shows them (the owner,
-- 2026-11-17: "By default can we hide people's injury date and categorize
-- them ... Have a selector in details for showing the injury date").
--
-- Everybody else is told how long ago, in five stages:
--   new     under six months        "Newly injured"
--   recent  six months to two years "Recently injured"
--   years   two to ten years
--   og      ten to forty years      "OG"
--   oog     forty years and more    "OOG"
--
-- Expand only (the iOS app may lag): one column with a default, browse_members
-- keeps every column and adds injury_stage at the end, and an older app reads
-- a hidden date as one never given, which it already handles.

alter table public.members add column if not exists show_injury_date boolean not null default false;

create or replace function public.injury_stage(injured date) returns text
language sql
stable
set search_path = ''
as $$
  select case
    when injured is null then null
    when injured > current_date - interval '6 months' then 'new'
    when injured > current_date - interval '2 years' then 'recent'
    when injured > current_date - interval '10 years' then 'years'
    when injured > current_date - interval '40 years' then 'og'
    else 'oog'
  end;
$$;

-- Public, as the view calls it as its reader; it reads nothing.
revoke all on function public.injury_stage(date) from public;
grant execute on function public.injury_stage(date) to authenticated, anon;

-- ----------------------------------------------------------- browse_members --
-- As 20261028950000, with the date behind show_injury_date and injury_stage at the end.
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
  public.injury_stage(m.injury_date) as injury_stage
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

-- ------------------------------------------------------------ about_us_team --
-- As 20261115150000: the year only where it is shown, and the stage.
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
