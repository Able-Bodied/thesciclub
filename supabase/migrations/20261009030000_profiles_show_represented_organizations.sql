-- Show administrator-linked organization identities on member profiles. These
-- links are separate from the member's self-described affiliations. The private
-- representatives table stays inaccessible; browse_members keeps its original
-- active-viewer/profile gate and publishes no added_by or private member fields.
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
  ), '[]'::jsonb) as represented_organizations
from public.members m
where m.show_in_browse and m.status = 'active'
  and exists (
    select 1 from public.members viewer
    where viewer.id = auth.uid() and viewer.status = 'active'
  );

revoke all on public.browse_members from public, anon, authenticated;
grant select on public.browse_members to authenticated;
