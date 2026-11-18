-- ============================================================================
-- "How did it go?" is not asked of the people who held the event
-- (20261118200000)
-- ============================================================================
-- The owner, 2026-11-18: a notification to review their own event opened a
-- page that refused them. Whoever speaks for the organization that held an
-- event may not review it (review_options), so they are not asked to.
--
-- One step, the one that matters: after the morning-after run, the guest who
-- checked in is asked and the organizer who checked in is not, and the
-- organizer still may not review while the guest may.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/event-followup-not-to-its-organizers.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1119-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organizer@probe.example'),
  ('bbbbbbbb-1119-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guest@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin) values
  ('aaaaaaaa-1119-0000-0000-00000000000a', 'peer', 'active', 'Organizer', '19990001191', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-1119-0000-0000-00000000000b', 'peer', 'active', 'Guest', '19990001192', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('eeeeeeee-1119-0000-0000-00000000000e', 'PRFU', 'Probe Followup Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id) values
  ('eeeeeeee-1119-0000-0000-00000000000e', 'aaaaaaaa-1119-0000-0000-00000000000a');
-- Ended two days ago, so its morning after has passed; both check in now,
-- which is "after that", and the next run asks them.
insert into public.events (id, title, host_name, start_time, end_time, added_by, organization_id) values
  ('13131313-1119-0000-0000-000000000001', 'Probe Followup', 'Probe host',
   now() - interval '2 days 2 hours', now() - interval '2 days',
   'aaaaaaaa-1119-0000-0000-00000000000a', 'eeeeeeee-1119-0000-0000-00000000000e');
insert into public.event_check_ins (event_id, member_id) values
  ('13131313-1119-0000-0000-000000000001', 'aaaaaaaa-1119-0000-0000-00000000000a'),
  ('13131313-1119-0000-0000-000000000001', 'bbbbbbbb-1119-0000-0000-00000000000b');

\echo ''
\echo '== 1. THE ONE THAT MATTERS: the morning-after run (expect asked: Guest only; notifications: Guest only; may review: Organizer f, Guest t) =='
select public.push_event_reminders() is not null as ran;
select string_agg(m.display_name, ',' order by m.display_name) as asked
  from public.event_followups_sent s join public.members m on m.id = s.member_id
 where s.event_id = '13131313-1119-0000-0000-000000000001';
select string_agg(m.display_name, ',' order by m.display_name) as notified
  from public.notifications n join public.members m on m.id = n.member_id
 where n.kind = 'event_followup' and n.event_id = '13131313-1119-0000-0000-000000000001';
select private.act_as('aaaaaaaa-1119-0000-0000-00000000000a') is not null as ok;
set local role authenticated;
select can_review as organizer_may_review
  from public.review_options('13131313-1119-0000-0000-000000000001', null);
reset role;
select private.act_as('bbbbbbbb-1119-0000-0000-00000000000b') is not null as ok;
set local role authenticated;
select can_review as guest_may_review
  from public.review_options('13131313-1119-0000-0000-000000000001', null);
reset role;

rollback;
