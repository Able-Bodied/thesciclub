-- ============================================================================
-- An injury date is hidden unless its member shows it (20261117030000)
-- ============================================================================
-- Hid (date not shown) and Shw (shown) are read by Rdr through browse_members:
-- Hid's date and precision come back null with the stage, Shw's come back
-- whole, and Hid reading themselves still gets their own date. The stages at
-- each boundary are read too. Run against the test project on 2026-11-17:
-- "Hid: null/null/years; Shw: 2013-06-14/day/og; own: 2020-03-01;
--  stages: new,recent,years,og,oog,null".
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres -At \
--     < supabase/tests/injury-date-hidden-unless-shown.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare hid text; shw text; own text; stages text;
begin
  insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state,
                              injury_date, injury_date_precision, show_injury_date) values
    ('d1d00000-1117-0000-0000-000000000001', 'peer', 'active', 'Rdr', '19991117001', '1980-01-01', 'T1–T6', 'CA', null, null, false),
    ('d1d00000-1117-0000-0000-000000000002', 'peer', 'active', 'Hid', '19991117002', '1980-01-01', 'T1–T6', 'CA', '2020-03-01', 'day', false),
    ('d1d00000-1117-0000-0000-000000000003', 'peer', 'active', 'Shw', '19991117003', '1980-01-01', 'T1–T6', 'CA', '2013-06-14', 'day', true);

  perform set_config('request.jwt.claims', '{"sub":"d1d00000-1117-0000-0000-000000000001","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select coalesce(b.injury_date::text, 'null') || '/' || coalesce(b.injury_date_precision, 'null') || '/' || coalesce(b.injury_stage, 'null')
    into hid from public.browse_members b where b.id = 'd1d00000-1117-0000-0000-000000000002';
  select coalesce(b.injury_date::text, 'null') || '/' || coalesce(b.injury_date_precision, 'null') || '/' || coalesce(b.injury_stage, 'null')
    into shw from public.browse_members b where b.id = 'd1d00000-1117-0000-0000-000000000003';

  perform set_config('request.jwt.claims', '{"sub":"d1d00000-1117-0000-0000-000000000002","role":"authenticated"}', true);
  select coalesce(b.injury_date::text, 'null') into own from public.browse_members b where b.id = 'd1d00000-1117-0000-0000-000000000002';

  select string_agg(coalesce(public.injury_stage(d::date), 'null'), ',' order by n) into stages from (values
    (1, current_date - interval '6 months' + interval '1 day'),
    (2, current_date - interval '6 months'),
    (3, current_date - interval '2 years'),
    (4, current_date - interval '10 years'),
    (5, current_date - interval '40 years'),
    (6, null)) v(n, d);

  raise exception 'RESULT Hid: %; Shw: %; own: %; stages: %', hid, shw, own, stages;
end $$;
