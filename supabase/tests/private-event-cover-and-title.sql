-- ============================================================================
-- A private event keeps its cover and its title to its audience (20261106050000)
-- ============================================================================
-- A member who is not invited reads neither the cover (nor a second photo) of
-- a private event nor its title from review_options; the invitee and the
-- organization's rep read both; a club event's cover and an upload no event
-- uses yet stay readable.
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/private-event-cover-and-title.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-c0de-0000-0000-00000000000a', 'peer', 'active', 'Org Rep',   '19990000d00', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-c0de-0000-0000-00000000000b', 'peer', 'active', 'Invitee',   '19990000d01', '1981-01-01', 'C5–C8', 'CA'),
  ('cccccccc-c0de-0000-0000-00000000000c', 'peer', 'active', 'Stranger',  '19990000d02', '1982-01-01', 'C5–C8', 'CA');

insert into public.organizations (id, short_code, name, city, state)
values ('11111111-c0de-0000-0000-000000000001', 'PRPV', 'Probe Private', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-c0de-0000-0000-000000000001', 'aaaaaaaa-c0de-0000-0000-00000000000a');

insert into public.events (id, title, start_time, organization_id, event_format, location, audience,
                           photo_path, more_photos)
values
  ('eeeeeeee-c0de-0000-0000-000000000001', 'Probe secret dinner', now() + interval '3 days',
   '11111111-c0de-0000-0000-000000000001', 'in_person', 'Oakland', 'people',
   'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp',
   '[{"path": "events/eeeeeeee-c0de-0000-0000-000000000001/second.webp"}]'::jsonb),
  ('eeeeeeee-c0de-0000-0000-000000000002', 'Probe open picnic', now() + interval '4 days',
   '11111111-c0de-0000-0000-000000000001', 'in_person', 'Oakland', 'club',
   'events/eeeeeeee-c0de-0000-0000-000000000002/cover.webp', '[]'::jsonb);
insert into public.event_invitees (event_id, member_id)
values ('eeeeeeee-c0de-0000-0000-000000000001', 'bbbbbbbb-c0de-0000-0000-00000000000b');

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('photos', 'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp',  'aaaaaaaa-c0de-0000-0000-00000000000a', '{"size": 1}'),
  ('photos', 'events/eeeeeeee-c0de-0000-0000-000000000001/second.webp', 'aaaaaaaa-c0de-0000-0000-00000000000a', '{"size": 1}'),
  ('photos', 'events/eeeeeeee-c0de-0000-0000-000000000001/unsaved.webp','aaaaaaaa-c0de-0000-0000-00000000000a', '{"size": 1}'),
  ('photos', 'events/eeeeeeee-c0de-0000-0000-000000000002/cover.webp',  'aaaaaaaa-c0de-0000-0000-00000000000a', '{"size": 1}');

\echo ''
\echo '== 1. the stranger (expect private 0, second 0, unsaved 1, club 1; then review_options: secret 0 rows, picnic 1 row "Probe open picnic") =='
select set_config('request.jwt.claims', '{"sub":"cccccccc-c0de-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp') as private,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/second.webp') as second,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/unsaved.webp') as unsaved,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000002/cover.webp') as club;
select count(*) as secret_rows from public.review_options('eeeeeeee-c0de-0000-0000-000000000001');
select title from public.review_options('eeeeeeee-c0de-0000-0000-000000000002');
reset role;

\echo ''
\echo '== 2. the invitee (expect private 1, second 1, club 1; review_options title "Probe secret dinner") =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-c0de-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp') as private,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/second.webp') as second,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000002/cover.webp') as club;
select title from public.review_options('eeeeeeee-c0de-0000-0000-000000000001');
reset role;

\echo ''
\echo '== 3. the organization''s rep (expect private 1, second 1; review_options title "Probe secret dinner") =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-c0de-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp') as private,
  (select count(*) from storage.objects where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/second.webp') as second;
select title from public.review_options('eeeeeeee-c0de-0000-0000-000000000001');
reset role;

\echo ''
\echo '== 4. made a club event, the stranger reads its cover (expect private 1) =='
update public.events set audience = 'club' where id = 'eeeeeeee-c0de-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"cccccccc-c0de-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select count(*) as private from storage.objects
 where bucket_id = 'photos' and name = 'events/eeeeeeee-c0de-0000-0000-000000000001/cover.webp';
reset role;

rollback;
