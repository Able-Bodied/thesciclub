-- ============================================================================
-- How the invites did: link clicked, started onboarding, joined (20261118225000)
-- ============================================================================
-- Four invites from Adm: Cy's never clicked; Di clicked the link; Ed made an
-- account from it and got as far as the city step; Flo finished and is a
-- member. Adm reads each one's stage and Ed's step; Bea, not an administrator,
-- is refused.
-- Run against the test project on 2026-11-18:
--   "cy: -/-/-/-; di: clicked/-/-/-; ed: clicked/started/-/city;
--    flo: clicked/started/joined/-; bea: refused"
--
--   node --env-file=.env.local <runner> supabase/tests/invites-link-clicked-started-joined.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare
  adm constant uuid := 'a5500000-1120-0000-0000-000000000021';
  bea constant uuid := 'a5500000-1120-0000-0000-000000000022';
  ed constant uuid := 'a5500000-1120-0000-0000-000000000023';
  flo constant uuid := 'a5500000-1120-0000-0000-000000000024';
  stages text;
  bea_reads text := 'allowed';
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (ed, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ed@probe-1120.example'),
    (flo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'flo@probe-1120.example');
  insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
    (adm, 'peer', 'active', 'Adm', '19991120121', '1980-01-01', 'T1–T6', 'CA', true),
    (bea, 'peer', 'active', 'Bea', '19991120122', '1980-01-01', 'T1–T6', 'CA', false),
    (flo, 'peer', 'active', 'Flo', '19991120124', '1980-01-01', 'T1–T6', 'CA', false);
  insert into public.invites (email, status, invited_by_member_id, sent_at, link_opened_at, claimed_by, claimed_at) values
    ('cy@probe-1120.example', 'pending', adm, now(), null, null, null),
    ('di@probe-1120.example', 'pending', adm, now(), now(), null, null),
    ('ed@probe-1120.example', 'pending', adm, now(), now(), ed, now()),
    ('flo@probe-1120.example', 'pending', adm, now(), now(), flo, now());
  insert into public.onboarding_steps (user_id, step, reached_at) values
    (ed, 'agree', now() - interval '3 minutes'),
    (ed, 'name', now() - interval '2 minutes'),
    (ed, 'city', now() - interval '1 minute');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select string_agg(split_part(t.email, '@', 1) || ': '
      || case when t.link_opened_at is null then '-' else 'clicked' end || '/'
      || case when t.started_at is null then '-' else 'started' end || '/'
      || case when t.member_joined_at is null then '-' else 'joined' end || '/'
      || coalesce(t.reached_step, '-'), '; ' order by t.email)
    into stages
    from public.admin_invite_tracking() t
   where t.email like '%@probe-1120.example';

  perform set_config('request.jwt.claims', json_build_object('sub', bea, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_invite_tracking();
  exception when others then bea_reads := 'refused';
  end;

  raise exception 'RESULT %; bea: %', stages, bea_reads;
end;
$$;
