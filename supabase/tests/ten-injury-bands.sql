-- ============================================================================
-- Ten bands of how long ago (20261118226000)
-- ============================================================================
-- A date in each band reads 0 to 9, none reads null, and browse_members,
-- chat_authors and about_us_team carry injury_band beside injury_stage.
-- Run against the test project on 2026-11-18:
--   "bands: 0,1,2,3,4,5,6,7,8,9 none: null; views: true true true"
--
--   node --env-file=.env.local <runner> supabase/tests/ten-injury-bands.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare
  bands text;
  views text;
begin
  select string_agg(public.injury_band((current_date - x.ago)::date)::text, ',' order by x.ago)
    into bands
    from (values (interval '1 month'), (interval '7 months'), (interval '18 months'),
                 (interval '3 years'), (interval '7 years'), (interval '15 years'),
                 (interval '25 years'), (interval '35 years'), (interval '45 years'),
                 (interval '60 years')) as x(ago);

  select (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'browse_members' and column_name = 'injury_band')
      || ' ' || (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'chat_authors' and column_name = 'injury_band')
      || ' ' || (pg_get_functiondef('public.about_us_team()'::regprocedure) like '%''injury_band''%')
    into views;

  raise exception 'RESULT bands: % none: %; views: %',
    bands, coalesce(public.injury_band(null)::text, 'null'), views;
end;
$$;
