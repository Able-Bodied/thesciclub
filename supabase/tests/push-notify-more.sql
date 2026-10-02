-- ============================================================================
-- The six kinds added by 20260927020000, the badge, and the switches on Me.
-- ============================================================================
-- Like push-notify.sql, steps 1–7 exercise `push_owed` as the superuser on
-- purpose: it is a definer function the service role calls, so its own joins
-- decide the answer, not RLS. Steps 8–9 switch to a signed-in role and print
-- current_user.
--
-- Step 3 (a report reaches administrators and says nothing about itself) and
-- step 6 (the badge agrees with chat_unread_count) are the ones that matter.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/push-notify-more.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-6666-0000-0000-00000000000a', 'peer',   'active', 'Ana',    '19990000070', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-6666-0000-0000-00000000000b', 'peer',   'active', 'Bo',     '19990000071', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-6666-0000-0000-00000000000c', 'peer',   'active', 'Cy',     '19990000072', '1982-01-01', 'C5–C8', 'CA', false),
  ('dddddddd-6666-0000-0000-00000000000d', 'mentor', 'active', 'Mentor', '19990000073', '1983-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-6666-0000-0000-00000000000e', 'mentor', 'active', 'Admin1', '19990000074', '1984-01-01', 'C5–C8', 'CA', true),
  ('ffffffff-6666-0000-0000-00000000000f', 'mentor', 'active', 'Admin2', '19990000075', '1985-01-01', 'C5–C8', 'CA', true);

insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999000007%';

-- Whose device a row is for, by name.
\set whom '(select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint)'

\echo ''
\echo '== 1. added to a group by somebody else (expect Bo, group_add, Ana) =='
insert into public.chat_threads (id, kind, name) values ('11111111-6666-0000-0000-000000000001', 'group', 'Probe group');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-6666-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-00000000000a'),
  ('11111111-6666-0000-0000-000000000001', 'bbbbbbbb-6666-0000-0000-00000000000b');
select :whom as to_whom, kind, actor_name, url
  from public.push_owed(:'secret', 'group_add',
    '{"thread_id":"11111111-6666-0000-0000-000000000001","member_id":"bbbbbbbb-6666-0000-0000-00000000000b","by":"aaaaaaaa-6666-0000-0000-00000000000a"}') o;

\echo ''
\echo '== 1b. adding yourself sends nothing (expect 0) =='
select count(*) as owed_self from public.push_owed(:'secret', 'group_add',
  '{"thread_id":"11111111-6666-0000-0000-000000000001","member_id":"bbbbbbbb-6666-0000-0000-00000000000b","by":"bbbbbbbb-6666-0000-0000-00000000000b"}');

\echo ''
\echo '== 1c. and switching the kind off stops it (expect 0) =='
insert into public.push_muted_kinds (member_id, kind) values ('bbbbbbbb-6666-0000-0000-00000000000b', 'group_add');
select count(*) as owed_muted from public.push_owed(:'secret', 'group_add',
  '{"thread_id":"11111111-6666-0000-0000-000000000001","member_id":"bbbbbbbb-6666-0000-0000-00000000000b","by":"aaaaaaaa-6666-0000-0000-00000000000a"}');
delete from public.push_muted_kinds;

\echo ''
\echo '== 2. a reply reaches the starter as reply and a poster as reply_participant, never the replier (expect Bo reply, Cy reply_participant) =='
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-room-2', 'Probe room 2', 'For the probe.', 'Life', 997, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('33333333-6666-0000-0000-000000000001', 'probe-room-2', 'Bo asks', 'bbbbbbbb-6666-0000-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('44444444-6666-0000-0000-000000000001', '33333333-6666-0000-0000-000000000001', 'bbbbbbbb-6666-0000-0000-00000000000b', 'The question'),
  ('44444444-6666-0000-0000-000000000002', '33333333-6666-0000-0000-000000000001', 'cccccccc-6666-0000-0000-00000000000c', 'An answer'),
  ('44444444-6666-0000-0000-000000000003', '33333333-6666-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-00000000000a', 'Another answer');
\echo '   expect: Bo | reply | Ana | Another answer, and Cy | reply_participant | Ana | Another answer'
select :whom as to_whom, kind, actor_name, body
  from public.push_owed(:'secret', 'post', '{"id":"44444444-6666-0000-0000-000000000003"}') o
 order by 1;

\echo ''
\echo '== 2b. Cy switches participant replies off (expect Bo only) =='
insert into public.push_muted_kinds (member_id, kind) values ('cccccccc-6666-0000-0000-00000000000c', 'reply_participant');
select :whom as to_whom from public.push_owed(:'secret', 'post', '{"id":"44444444-6666-0000-0000-000000000003"}') o;
delete from public.push_muted_kinds;

\echo ''
\echo '== 3. THE ONE THAT MATTERS: a report reaches every administrator but the reporter, and says nothing (expect Admin2 only, no name, no words) =='
insert into public.chat_reports (id, kind, post_id, reporter_id, reported_author_id, body_snapshot, written_at, place, context_kind)
values ('55555555-6666-0000-0000-000000000001', 'post', '44444444-6666-0000-0000-000000000003',
        'eeeeeeee-6666-0000-0000-00000000000e', 'aaaaaaaa-6666-0000-0000-00000000000a',
        'Another answer', now(), 'Probe room 2', 'room');
select :whom as to_whom, kind, actor_name is null as no_name, body is null as no_words, subject is null as no_subject, url
  from public.push_owed(:'secret', 'report', '{"id":"55555555-6666-0000-0000-000000000001"}') o
 -- Only this file's people: a local stack's real administrators are owed one too.
 where :whom like 'Admin%';

\echo ''
\echo '== 4. somebody a mentor invited joins (expect Mentor, invite_joined, the new name) =='
insert into public.invites (id, phone_raw, invited_by_member_id)
values ('66666666-6666-0000-0000-000000000001', '19990000079', 'dddddddd-6666-0000-0000-00000000000d');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, invite_id)
values ('99999999-6666-0000-0000-000000000009', 'peer', 'active', 'Newcomer', '19990000079', '1990-01-01', 'T1–T6', 'CA',
        '66666666-6666-0000-0000-000000000001');
select :whom as to_whom, kind, actor_name, url
  from public.push_owed(:'secret', 'member_joined', '{"id":"99999999-6666-0000-0000-000000000009"}') o;

\echo ''
\echo '== 5. the daily run: tomorrow''s event for somebody going, and a digest per followed organization =='
\echo '   (expect Bo event_reminder "Probe tomorrow" with a time; Bo org_events with count 3; nothing for the day after)'
insert into public.events (id, feed_id, external_id, title, start_time, organization_id)
select '77777777-6666-0000-0000-000000000001', f.id, 'probe-tomorrow', 'Probe tomorrow',
       ((now() at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date + 1 + time '10:00')
         at time zone coalesce(f.timezone, 'America/Los_Angeles'),
       null
  from public.data_feeds f order by f.id limit 1;
insert into public.events (id, feed_id, external_id, title, start_time)
select '77777777-6666-0000-0000-000000000002', f.id, 'probe-later', 'Probe later', now() + interval '3 days'
  from public.data_feeds f order by f.id limit 1;
insert into public.event_rsvps (event_id, member_id, status) values
  ('77777777-6666-0000-0000-000000000001', 'bbbbbbbb-6666-0000-0000-00000000000b', 'going'),
  ('77777777-6666-0000-0000-000000000002', 'bbbbbbbb-6666-0000-0000-00000000000b', 'going'),
  ('77777777-6666-0000-0000-000000000001', 'cccccccc-6666-0000-0000-00000000000c', 'interested');
insert into public.organizations (id, short_code, name, city) values
  ('88888888-6666-0000-0000-000000000001', 'PRB', 'Probe Org', 'San Jose');
insert into public.organization_follows (member_id, organization_id) values
  ('bbbbbbbb-6666-0000-0000-00000000000b', '88888888-6666-0000-0000-000000000001');
insert into public.events (feed_id, external_id, title, start_time, organization_id)
select f.id, 'probe-org-' || n, 'Org event ' || n, now() + (n || ' days')::interval, '88888888-6666-0000-0000-000000000001'
  from public.data_feeds f, generate_series(4, 6) n order by f.id limit 3;
-- An old one from the same organization, created long ago: not new.
insert into public.events (feed_id, external_id, title, start_time, organization_id, created_at)
select f.id, 'probe-org-old', 'Org event old', now() + interval '9 days', '88888888-6666-0000-0000-000000000001', now() - interval '3 days'
  from public.data_feeds f order by f.id limit 1;
select :whom as to_whom, kind, subject, detail, url
  from public.push_owed(:'secret', 'daily', '{}') o
 where :whom in ('Bo', 'Cy')
 order by kind;

\echo ''
\echo '== 5b. switching reminders off stops them (expect only org_events for Bo) =='
insert into public.push_muted_kinds (member_id, kind) values ('bbbbbbbb-6666-0000-0000-00000000000b', 'event_reminder');
select :whom as to_whom, kind from public.push_owed(:'secret', 'daily', '{}') o where :whom = 'Bo';
delete from public.push_muted_kinds;

\echo ''
\echo '== 5c. the daily run runs once a day (expect 1 run after two calls) =='
delete from public.push_daily_runs where day = (now() at time zone 'America/Los_Angeles')::date;
select public.push_daily();
select public.push_daily();
select count(*) as runs_today from public.push_daily_runs where day = (now() at time zone 'America/Los_Angeles')::date;

\echo ''
\echo '== 6. THE BADGE: push_unread_count agrees with chat_unread_count as the member (expect the same number twice, 1) =='
insert into public.chat_threads (id, kind, direct_key) values ('11111111-6666-0000-0000-000000000002', 'direct', 'probe-ana-bo');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-6666-0000-0000-000000000002', 'aaaaaaaa-6666-0000-0000-00000000000a'),
  ('11111111-6666-0000-0000-000000000002', 'bbbbbbbb-6666-0000-0000-00000000000b');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('22222222-6666-0000-0000-000000000001', '11111111-6666-0000-0000-000000000002', 'aaaaaaaa-6666-0000-0000-00000000000a', 'Hello Bo');
select public.push_unread_count('bbbbbbbb-6666-0000-0000-00000000000b') as for_bo;
select badge as on_the_push from public.push_owed(:'secret', 'message', '{"id":"22222222-6666-0000-0000-000000000001"}');
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-6666-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user, public.chat_unread_count() as as_bo_sees_it;

\echo ''
\echo '== 7. a member cannot call the badge function (expect ERROR) =='
savepoint member_badge;
select public.push_unread_count('aaaaaaaa-6666-0000-0000-00000000000a');
rollback to savepoint member_badge;

\echo ''
\echo '== 8. switches are private: Bo switches one off (INSERT 0 1), cannot for Cy (ERROR), sees only his own (expect 1) =='
insert into public.push_muted_kinds (member_id, kind) values ('bbbbbbbb-6666-0000-0000-00000000000b', 'org_events');
savepoint forge_kind;
insert into public.push_muted_kinds (member_id, kind) values ('cccccccc-6666-0000-0000-00000000000c', 'org_events');
rollback to savepoint forge_kind;
set local role postgres;
insert into public.push_muted_kinds (member_id, kind) values ('cccccccc-6666-0000-0000-00000000000c', 'report');
set local role authenticated;
select count(*) as visible_to_bo from public.push_muted_kinds;

\echo ''
\echo '== 8b. a device the push service calls gone is forgotten, unless it is minutes old (expect young kept 1, old gone 0) =='
set local role postgres;
update public.push_subscriptions set created_at = now() - interval '1 hour'
 where endpoint = 'https://web.push.apple.com/aaaaaaaa';
select public.push_forget(:'secret', array['https://web.push.apple.com/aaaaaaaa', 'https://web.push.apple.com/bbbbbbbb']);
select (select count(*) from public.push_subscriptions where endpoint = 'https://web.push.apple.com/bbbbbbbb') as young_kept,
       (select count(*) from public.push_subscriptions where endpoint = 'https://web.push.apple.com/aaaaaaaa') as old_gone;
set local role authenticated;

\echo ''
\echo '== 9. an unknown kind is refused (expect ERROR, check constraint) =='
savepoint bad_kind;
insert into public.push_muted_kinds (member_id, kind) values ('bbbbbbbb-6666-0000-0000-00000000000b', 'everything');
rollback to savepoint bad_kind;

rollback;
