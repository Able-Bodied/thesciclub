-- ============================================================================
-- Deleting your own account: what goes, what stays, and who may
-- ============================================================================
-- 20261003080000. A member presses Delete my account on Me. Their sign-in
-- account, member row, profile and every invite holding their number go;
-- their posts and messages stay with nobody's name on them; a report keeps
-- its copy of the words, unnamed. An administrator is refused.
--
-- Run as the signed-in member doing it, not as the superuser — postgres is
-- BYPASSRLS, and the function is the thing under test. The superuser writes
-- the situation first and reads the results after; the readings are counts of
-- rows that are there or not, which a role switch would only hide. Every
-- expected refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/delete-my-account.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Leaver joined on an organization's invite (consumed), was once invited
-- before and revoked (a second row with the same number), and has an invite
-- of their own nobody has used. Other stays.
insert into auth.users (id, instance_id, aud, role, phone)
values ('aaaaaaaa-8080-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '14085558001');

insert into public.invites (phone_raw, invited_by_organization_id, status, revoked_at)
select '4085558001', id, 'revoked', now() - interval '1 year' from public.organizations where short_code = 'NCS';
insert into public.invites (phone_raw, invited_by_organization_id, status, consumed_at)
select '4085558001', id, 'consumed', now() from public.organizations where short_code = 'NCS';

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, bio, show_in_browse, invite_id)
values
  ('aaaaaaaa-8080-0000-0000-000000000001', 'mentor', 'active', 'Leaver', '14085558001', '1980-01-01',
   'T1–T6', 'CA', 'Rugby on Tuesdays.', true,
   (select id from public.invites where phone = '14085558001' and status = 'consumed')),
  ('bbbbbbbb-8080-0000-0000-000000000002', 'peer', 'active', 'Other', '14085558002', '1981-01-01',
   'C5–C8', 'CA', null, true, null),
  ('eeeeeeee-8080-0000-0000-000000000005', 'mentor', 'active', 'Admin', '14085558005', '1984-01-01',
   'T1–T6', 'CA', null, true, null);
update public.members set is_admin = true where id = 'eeeeeeee-8080-0000-0000-000000000005';

insert into public.invites (phone_raw, invited_by_member_id)
values ('4085558009', 'aaaaaaaa-8080-0000-0000-000000000001');

update public.chat_rooms set opened_at = now() where id = 'bowel';
insert into public.chat_topics (id, room_id, title, author_id) values
  ('80800000-0000-0000-0000-00000000000a', 'bowel', 'Leaver asks', 'aaaaaaaa-8080-0000-0000-000000000001');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('80800000-0000-0000-0000-0000000000a1', '80800000-0000-0000-0000-00000000000a',
   'aaaaaaaa-8080-0000-0000-000000000001', 'What worked for you?'),
  ('80800000-0000-0000-0000-0000000000a2', '80800000-0000-0000-0000-00000000000a',
   'bbbbbbbb-8080-0000-0000-000000000002', 'Air cells.');

insert into public.event_rsvps (event_id, member_id, status)
select id, 'aaaaaaaa-8080-0000-0000-000000000001', 'going' from public.events limit 1;

-- Leaver writes to Other; Other reports Leaver's post.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8080-0000-0000-000000000001","role":"authenticated","phone":"14085558001"}', true) is not null as ok;
select public.chat_open_direct('bbbbbbbb-8080-0000-0000-000000000002') as thread \gset
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'aaaaaaaa-8080-0000-0000-000000000001', 'See you at rugby.');
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-8080-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
select public.chat_report_post('80800000-0000-0000-0000-0000000000a1', 'testing') is not null as reported;
reset role;

\echo ''
\echo '== 0. before: Leaver has an account, a row, two invites on their number (expect 1 | 1 | 2) =='
select (select count(*) from auth.users where id = 'aaaaaaaa-8080-0000-0000-000000000001') as account,
       (select count(*) from public.members where id = 'aaaaaaaa-8080-0000-0000-000000000001') as member,
       (select count(*) from public.invites where phone = '14085558001') as invites;

\echo ''
\echo '== 1. signed out, nobody can call it (expect ERROR: permission denied for function) =='
set local role anon;
savepoint anon_call;
select public.delete_my_account();
rollback to savepoint anon_call;
reset role;

\echo ''
\echo '== 2. an administrator is refused (expect ERROR: An administrator''s account cannot be deleted) =='
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-8080-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
savepoint admin_call;
select public.delete_my_account();
rollback to savepoint admin_call;

\echo ''
\echo '== 3. Leaver deletes their own account (expect authenticated, then no error) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8080-0000-0000-000000000001","role":"authenticated","phone":"14085558001"}', true) is not null as ok;
select current_user;
select public.delete_my_account();
reset role;

\echo ''
\echo '== 4. their account, row and number are gone (expect 0 | 0 | 0) =='
select (select count(*) from auth.users where id = 'aaaaaaaa-8080-0000-0000-000000000001') as account,
       (select count(*) from public.members where id = 'aaaaaaaa-8080-0000-0000-000000000001') as member,
       (select count(*) from public.invites where phone = '14085558001') as invites;

\echo ''
\echo '== 5. and what hung off the row went with it (expect 0 | 0) =='
select (select count(*) from public.event_rsvps where member_id = 'aaaaaaaa-8080-0000-0000-000000000001') as rsvps,
       (select count(*) from public.chat_thread_members where member_id = 'aaaaaaaa-8080-0000-0000-000000000001') as conversations;

\echo ''
\echo '== 6. the invite they issued and nobody used is revoked, not left open (expect revoked) =='
select status from public.invites where phone = '14085558009';

\echo ''
\echo '== 7. their words stay, with nobody''s name (expect t on all three: topic, post, message) =='
select (author_id is null) as unnamed, title from public.chat_topics where id = '80800000-0000-0000-0000-00000000000a';
select (author_id is null) as unnamed, body from public.chat_posts where id = '80800000-0000-0000-0000-0000000000a1';
select (author_id is null) as unnamed, body from public.chat_messages where thread_id = :'thread';

\echo ''
\echo '== 8. the report keeps the words and names nobody (expect What worked for you? | t) =='
select body_snapshot, reported_author_id is null as unnamed
  from public.chat_reports where post_id = '80800000-0000-0000-0000-0000000000a1';

\echo ''
\echo '== 9. Other is untouched (expect 1 | Air cells. by Other) =='
select count(*) as other from public.members where id = 'bbbbbbbb-8080-0000-0000-000000000002';
select body, author_id = 'bbbbbbbb-8080-0000-0000-000000000002' as still_theirs
  from public.chat_posts where id = '80800000-0000-0000-0000-0000000000a2';

rollback;
