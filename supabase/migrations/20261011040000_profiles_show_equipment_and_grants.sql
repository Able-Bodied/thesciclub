-- ============================================================================
-- Profiles show adaptive sports equipment and grants
-- ============================================================================
-- The owner, 2026-10-10: the two survey answers from 20261011020000 go on the
-- member's profile in Peers, under "Adaptive sports equipment" and "Grants".
-- 20261011020000 kept them off browse_members until the owner decided whether
-- other members should see them; this is that decision.
--
-- browse_members is restated from 20261009030000 with the two columns appended
-- at the end — `create or replace view` may add columns only after the
-- existing ones — and nothing else changed: the same rows (shown in browse,
-- active, read by an active member), security_barrier as 20261003030000 set
-- it, and the grants on the view are kept by `create or replace`.
--
-- The app reads browse_members with `select *`, so a client released before
-- this reads the profile without the two answers rather than failing.
-- ============================================================================

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
  m.injury_date,
  m.injury_date_precision,
  m.region,
  extract(year from age(m.birth_date))::int as age,
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
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path
    ) order by o.name, o.id)
    from public.organization_representatives r
    join public.organizations o on o.id = r.organization_id
    where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants
from public.members m
where m.show_in_browse and m.status = 'active'
  and exists (
    select 1 from public.members viewer
    where viewer.id = auth.uid() and viewer.status = 'active'
  );
