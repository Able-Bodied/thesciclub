-- ============================================================================
-- Family and professionals finish Your details without a level or a date
-- ============================================================================
-- The owner, 2026-11-04: choosing family or professional answers "your injury
-- or condition", and the date is not asked of them (details.tsx). This is
-- 20261022040000's member_details_done, for the reminders and Stats; Me's ring
-- is detailIsFilled in src/routes/profile/details-api.ts.
-- ============================================================================

create or replace function public.member_details_done(m public.members)
returns boolean language sql stable set search_path = '' as $$
  select public.profile_answered(m.photo_path, 'photo', m.declined)
     and (coalesce(m.injury_type in ('family', 'professional'), false) or (
          (public.profile_answered(m.exact_level, 'exactLevel', m.declined)
           or btrim(coalesce(m.condition_name, '')) <> '')
      and (m.injury_date is not null or 'injuryDate' = any(coalesce(m.declined, '{}'::text[])))
     ))
     and public.profile_answered(m.city, 'city', m.declined)
     and public.profile_answered(m.state, 'state', m.declined);
$$;
revoke all on function public.member_details_done(public.members) from public, anon, authenticated;
