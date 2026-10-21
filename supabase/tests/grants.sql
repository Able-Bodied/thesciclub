-- ============================================================================
-- Grants, their windows, and telling followers when one opens (20261021010000).
-- ============================================================================
-- What matters most: the cycle is worked out right (1–4), a follower is told
-- once per cycle and nobody else is (5–8), the list and the phone say the
-- same thing (9–10), and members read grants but cannot write them (11–12).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/grants.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1021-0000-0000-000000000001', 'peer', 'active', 'Follower', 'probe.follow1021', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1021-0000-0000-000000000002', 'peer', 'active', 'Bystander', 'probe.bystand1021', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.organizations (id, short_code, name, city, description, tags, can_invite)
values ('bbbbbbbb-1021-0000-0000-000000000001', 'PGR', 'Probe Grants', 'Nowhere', 'Gives grants.', '{}', false);

insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-1021-0000-0000-000000000001', 'bbbbbbbb-1021-0000-0000-000000000001');

insert into public.organization_grants (id, organization_id, name, url, summary) values
  ('cccccccc-1021-0000-0000-000000000001', 'bbbbbbbb-1021-0000-0000-000000000001', 'Open Fund', 'https://example.org/open', 'Open now.'),
  ('cccccccc-1021-0000-0000-000000000002', 'bbbbbbbb-1021-0000-0000-000000000001', 'Later Fund', 'https://example.org/later', 'Opens later.');

-- Open: began yesterday, every year. Later: opens in ten days.
insert into public.organization_grant_windows (id, grant_id, opens_on, closes_on, yearly) values
  ('dddddddd-1021-0000-0000-000000000001', 'cccccccc-1021-0000-0000-000000000001',
   (now() at time zone 'America/Los_Angeles')::date - 1, (now() at time zone 'America/Los_Angeles')::date + 30, false),
  ('dddddddd-1021-0000-0000-000000000002', 'cccccccc-1021-0000-0000-000000000002',
   (now() at time zone 'America/Los_Angeles')::date + 10, (now() at time zone 'America/Los_Angeles')::date + 40, false);

\echo ''
\echo '== 1. yearly, open now (expect 2026-10-01 | 2026-11-15) =='
select * from public.grant_window_cycle('2000-10-01', '2000-11-15', true, '2026-10-20');

\echo ''
\echo '== 2. yearly, closed for this year, so next year (expect 2027-03-01 | 2027-04-15) =='
select * from public.grant_window_cycle('2000-03-01', '2000-04-15', true, '2026-10-20');

\echo ''
\echo '== 3. yearly across New Year, open in January (expect 2026-12-01 | 2027-01-31) =='
select * from public.grant_window_cycle('2000-12-01', '2000-01-31', true, '2027-01-10');

\echo ''
\echo '== 4. dated and closed (expect 0 rows) =='
select * from public.grant_window_cycle('2026-01-01', '2026-02-01', false, '2026-10-20');

\echo ''
\echo '== 5. the daily job tells the follower about the open one only (expect 1 | Follower | grant_open) =='
select public.grant_windows_notify();
select count(*) as told, min(m.display_name) as who, min(n.kind) as kind
  from public.notifications n join public.members m on m.id = n.member_id
 where n.grant_id is not null;

\echo ''
\echo '== 6. the bystander, who does not follow, is not told (expect 0) =='
select count(*) from public.notifications
 where member_id = 'aaaaaaaa-1021-0000-0000-000000000002' and kind = 'grant_open';

\echo ''
\echo '== 7. a second run tells nobody again (expect 1 notice, 1 notification, count 1) =='
select public.grant_windows_notify();
select (select count(*) from public.grant_open_notices) as notices,
       count(*) as notifications, max(n.count) as count
  from public.notifications n where n.kind = 'grant_open';

\echo ''
\echo '== 8. the later one is not told yet (expect 0) =='
select count(*) from public.grant_open_notices where window_id = 'dddddddd-1021-0000-0000-000000000002';

\echo ''
\echo '== 9. the follower''s list: org, grant, closing day, its page (expect grant_open | Probe Grants | Open Fund | <today+30> | /events/organizations/bbbbbbbb-…) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1021-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;
select kind, place, excerpt, detail, url from public.my_notifications() where kind = 'grant_open';
reset role;

\echo ''
\echo '== 10. the phone: one row per device, muted kind sends nothing (expect 1, then 0) =='
insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
values ('aaaaaaaa-1021-0000-0000-000000000001', 'https://web.push.apple.com/probe1021', repeat('k', 87), repeat('a', 22));
select decrypted_secret as notify_secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset
select kind, subject, body, url, tag
  from public.push_owed(:'notify_secret', 'grant_open', '{"id":"dddddddd-1021-0000-0000-000000000001"}');
insert into public.push_muted_kinds (member_id, kind) values ('aaaaaaaa-1021-0000-0000-000000000001', 'grant_open');
select count(*) as after_mute
  from public.push_owed(:'notify_secret', 'grant_open', '{"id":"dddddddd-1021-0000-0000-000000000001"}');

\echo ''
\echo '== 11. a member reads grants and windows (expect 2 | 2) =='
set local role authenticated;
select current_user;
select (select count(*) from public.organization_grants where organization_id = 'bbbbbbbb-1021-0000-0000-000000000001') as grants,
       (select count(*) from public.organization_grant_windows w
          join public.organization_grants g on g.id = w.grant_id
         where g.organization_id = 'bbbbbbbb-1021-0000-0000-000000000001') as windows;

\echo ''
\echo '== 12. a member cannot add one, or read who was told (expect ERROR: permission denied, twice) =='
savepoint s12;
insert into public.organization_grants (organization_id, name, url, summary)
values ('bbbbbbbb-1021-0000-0000-000000000001', 'Mine', 'https://example.org', 'x');
rollback to savepoint s12;
select count(*) from public.grant_open_notices;
rollback to savepoint s12;
reset role;

\echo ''
\echo '== 13. the job is scheduled (expect grant-open-notify | 5 16 * * *) =='
select jobname, schedule from cron.job where jobname = 'grant-open-notify';

rollback;
