-- ============================================================================
-- How each member signs up and signs in (20261016000000, 20261016010000)
-- ============================================================================
-- public.record_sign_in, called as each member with the claims their token
-- would carry, and public.admin_sign_in_methods(period), read as an
-- administrator, a member and anon. sign_ins is emptied inside the
-- transaction so the counts are the probe's own. Every answer is printed and
-- read against its expect line:
--
--   1. the way a session began comes from the token, never the app's word:
--      password is email, a Google or Apple hint only if it is linked, a
--      one-time code is a link, or in the Home Screen app the member's last
--      other sign-in
--   2. one row a session, at the time it began, however often reported
--   3. refusals: another account's session, a member reading sign_ins,
--      anon calling either function, a member reading Stats
--   4. Stats: the way in, sign-ins by method, the Home Screen app, the list;
--      a phone identity is never a way in (20261016010000)
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-sign-in-methods.sql
--
-- One transaction, rolled back; each expected refusal in its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '(null)'

begin;

-- ------------------------------------------------------------------ set-up --
delete from public.sign_ins;

-- Ana joined by email and linked Google; Ben joined with Google and linked
-- Apple; Cy made an account with Apple and has not finished joining; Dee is
-- the administrator reading. Eve joined by phone and added email when email
-- became the account; Fay has nothing but a phone.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, raw_app_meta_data) values
  ('aaaaaaaa-1600-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@probe.test', now(), now() - interval '50 days', '{"provider":"email"}'),
  ('aaaaaaaa-1600-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ben@probe.test', now(), now() - interval '45 days', '{"provider":"google"}'),
  ('aaaaaaaa-1600-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cy@probe.test',  now(), now() - interval '40 days', '{"provider":"apple"}'),
  ('aaaaaaaa-1600-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dee@probe.test', now(), now() - interval '90 days', '{"provider":"email"}'),
  ('aaaaaaaa-1600-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eve@probe.test', now(), now() - interval '55 days', '{"provider":"phone"}'),
  ('aaaaaaaa-1600-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,             null,  now() - interval '52 days', '{"provider":"phone"}');

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
  ('aaaaaaaa-1600-0000-0000-000000000001', 'aaaaaaaa-1600-0000-0000-000000000001', '{"sub":"a"}',  'email',  now() - interval '50 days', now() - interval '50 days'),
  ('google-ana',                           'aaaaaaaa-1600-0000-0000-000000000001', '{"sub":"g1"}', 'google', now() - interval '35 days', now() - interval '35 days'),
  ('google-ben',                           'aaaaaaaa-1600-0000-0000-000000000002', '{"sub":"g2"}', 'google', now() - interval '45 days', now() - interval '45 days'),
  ('apple-ben',                            'aaaaaaaa-1600-0000-0000-000000000002', '{"sub":"a2"}', 'apple',  now() - interval '44 days', now() - interval '1 day'),
  ('apple-cy',                             'aaaaaaaa-1600-0000-0000-000000000003', '{"sub":"a3"}', 'apple',  now() - interval '40 days', now() - interval '40 days'),
  ('aaaaaaaa-1600-0000-0000-000000000004', 'aaaaaaaa-1600-0000-0000-000000000004', '{"sub":"d"}',  'email',  now() - interval '90 days', now() - interval '90 days'),
  ('14155550161',                          'aaaaaaaa-1600-0000-0000-000000000005', '{"sub":"e"}',  'phone',  now() - interval '55 days', now() - interval '55 days'),
  ('aaaaaaaa-1600-0000-0000-000000000005', 'aaaaaaaa-1600-0000-0000-000000000005', '{"sub":"e"}',  'email',  now() - interval '36 days', now() - interval '36 days'),
  ('14155550162',                          'aaaaaaaa-1600-0000-0000-000000000006', '{"sub":"f"}',  'phone',  now() - interval '52 days', now() - interval '52 days');

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1600-0000-0000-000000000001', 'peer', 'active', 'Ana Probe', 'probe.ana16', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1600-0000-0000-000000000002', 'peer', 'active', 'Ben Probe', 'probe.ben16', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1600-0000-0000-000000000004', 'peer', 'active', 'Dee Probe', 'probe.dee16', '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1600-0000-0000-000000000005', 'peer', 'active', 'Eve Probe', 'probe.eve16', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1600-0000-0000-000000000006', 'peer', 'active', 'Fay Probe', 'probe.fay16', '1980-01-01', 'T1–T6', 'CA', false);

-- Sessions, each begun at its own time: the second hex digit of the last
-- group says whose, the last says which.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('bbbbbbbb-1600-0000-0000-000000000011', 'aaaaaaaa-1600-0000-0000-000000000001', now() - interval '40 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000012', 'aaaaaaaa-1600-0000-0000-000000000001', now() - interval '34 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000013', 'aaaaaaaa-1600-0000-0000-000000000001', now() - interval '33 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000014', 'aaaaaaaa-1600-0000-0000-000000000001', now() - interval '32 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000021', 'aaaaaaaa-1600-0000-0000-000000000002', now() - interval '44 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000022', 'aaaaaaaa-1600-0000-0000-000000000002', now() - interval '43 days', now()),
  ('bbbbbbbb-1600-0000-0000-000000000023', 'aaaaaaaa-1600-0000-0000-000000000002', now() - interval '1 hour', now()),
  ('bbbbbbbb-1600-0000-0000-000000000031', 'aaaaaaaa-1600-0000-0000-000000000003', now() - interval '40 days', now());

-- Reports as `who`, for session `sid`, begun by `how`: what record_sign_in returns.
create function pg_temp.report(who text, sid text, how text, hint text default null, home boolean default false)
returns text language plpgsql as $$
declare way text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', who, 'role', 'authenticated', 'session_id', sid,
    'amr', jsonb_build_array(jsonb_build_object('method', how, 'timestamp', 1))
  )::text, true);
  set local role authenticated;
  select public.record_sign_in(hint, home) into way;
  reset role;
  return way;
end;
$$;

\echo ''
\echo '== 1. the way each session began, from its token =='
\echo '   expect: email   (Ana, password)'
\echo '           google  (Ana, oauth, hinted apple: she has no Apple, so her Google)'
\echo '           link    (Ana, a one-time code: a password reset)'
\echo '           google  (Ana, a one-time code in the Home Screen app: her last other sign-in)'
\echo '           google  (Ben, oauth, hinted google, though Apple was updated last)'
\echo '           apple   (Ben, oauth, no hint: the one Supabase updated last)'
\echo '           email   (Ben, email/signup, which is joining by email)'
\echo '           apple   (Cy, oauth, hinted apple)'
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000001', 'bbbbbbbb-1600-0000-0000-000000000011', 'password');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000001', 'bbbbbbbb-1600-0000-0000-000000000012', 'oauth', 'apple');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000001', 'bbbbbbbb-1600-0000-0000-000000000013', 'otp');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000001', 'bbbbbbbb-1600-0000-0000-000000000014', 'otp', null, true);
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000002', 'bbbbbbbb-1600-0000-0000-000000000021', 'oauth', 'google');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000002', 'bbbbbbbb-1600-0000-0000-000000000022', 'oauth');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000002', 'bbbbbbbb-1600-0000-0000-000000000023', 'email/signup');
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000003', 'bbbbbbbb-1600-0000-0000-000000000031', 'oauth', 'apple');

\echo ''
\echo '== 2. one row a session, at the time it began =='
\echo '   expect: apple, then 8 rows, Ana''s first at 40 days ago | t'
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000003', 'bbbbbbbb-1600-0000-0000-000000000031', 'password');
select count(*) as rows,
       (select at from public.sign_ins where session_id = 'bbbbbbbb-1600-0000-0000-000000000011')
         = (select created_at from auth.sessions where id = 'bbbbbbbb-1600-0000-0000-000000000011') as at_begun
  from public.sign_ins;
\echo '   expect: the eighth row is still apple: the second report changed nothing'
select method from public.sign_ins where session_id = 'bbbbbbbb-1600-0000-0000-000000000031';

\echo ''
\echo '== 3. refusals =='
\echo '   expect: (null), and still 8 rows   (Cy reporting Ana''s session)'
select pg_temp.report('aaaaaaaa-1600-0000-0000-000000000003', 'bbbbbbbb-1600-0000-0000-000000000011', 'password');
select count(*) from public.sign_ins;

\echo '   expect: ERROR: permission denied for table sign_ins   (Ana reading it)'
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1600-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member_reads_table;
select count(*) from public.sign_ins;
rollback to savepoint member_reads_table;

\echo '   expect: ERROR: Not an administrator   (Ana reading Stats)'
savepoint member_reads_stats;
select public.admin_sign_in_methods('all');
rollback to savepoint member_reads_stats;

\echo '   expect: two ERRORs: permission denied for function record_sign_in, then admin_sign_in_methods'
reset role;
set local role anon;
savepoint anon_records;
select public.record_sign_in();
rollback to savepoint anon_records;
savepoint anon_reads;
select public.admin_sign_in_methods('all');
rollback to savepoint anon_reads;
reset role;

\echo '   expect: ERROR: Unknown period: week'
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1600-0000-0000-000000000004","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint bad_period;
select public.admin_sign_in_methods('week');
rollback to savepoint bad_period;

\echo ''
\echo '== 4. Stats for 30 to 60 days ago, as Dee =='
create temp table r on commit drop as select public.admin_sign_in_methods('prev30d') as j;

\echo '   expect: {"apple": 1, "email": 2, "google": 1}'
\echo '   (Ana is email though she linked Google; Eve is email, not phone; Fay has no way in; Dee is older)'
select j -> 'signUps' from r;

\echo '   expect: apple  | 2 | 2'
\echo '           email  | 1 | 1   (Ana''s password, 40 days ago)'
\echo '           google | 3 | 2   (Ana twice, the Home Screen app''s included; Ben once)'
\echo '           link   | 1 | 1'
\echo '   (Ben''s email/signup is an hour ago, after the period)'
select k as method, (v ->> 'signIns')::int as sign_ins, (v ->> 'people')::int as people
  from r, jsonb_each(j -> 'signIns') e(k, v)
 order by k;

\echo '   expect: {"people": 1, "signIns": 1}   (the Home Screen app)'
select j -> 'homeScreen' from r;

\echo '   expect: Ben Probe | (null)        | google | ["apple", "google"] | email  | f | 2'
\echo '           Ana Probe | (null)        | email  | ["email", "google"] | google | t | 4'
\echo '           (null)    | cy@probe.test | apple  | ["apple"]           | apple  | f | 1'
\echo '           Fay Probe | (null)        | (null) | []                  | (null) | f | 0'
\echo '           Eve Probe | (null)        | email  | ["email"]           | (null) | f | 0'
\echo '   (Ben first: his latest, an hour ago, is newest; then those never signed in, newest first;'
\echo '    no phone anywhere; Dee is not listed)'
select a ->> 'name' as name, a ->> 'email' as email, a ->> 'signedUpWith' as signed_up_with,
       a -> 'methods' as methods, a ->> 'lastSignInMethod' as last_method,
       (a ->> 'lastSignInHomeScreen')::boolean as home_screen, (a ->> 'signIns')::int as sign_ins
  from r, jsonb_array_elements(j -> 'accounts') a;

\echo '   expect: t   (recordedSince is the oldest row, Ben''s 44 days ago)'
reset role;
select (j ->> 'recordedSince')::timestamptz
         = (select created_at from auth.sessions where id = 'bbbbbbbb-1600-0000-0000-000000000021')
  from r;

reset role;
rollback;
