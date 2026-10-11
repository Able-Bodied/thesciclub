-- Local only, rolled back. Real anon/authenticated roles, not the table owner.
-- Run: docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--        < supabase/tests/events-require-membership.sql
-- ON_ERROR_STOP makes every assertion fail the command, including unexpected
-- success when the anonymous caller asks for RSVP counts.
\set ON_ERROR_STOP on
begin;

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
values
  ('aa000000-1012-6000-0000-000000000001', 'peer', 'active', 'Calendar reader', '1980-01-01', 'T1–T6', 'CA', false),
  ('aa000000-1012-6000-0000-000000000002', 'peer', 'active', 'Other reader', '1980-01-01', 'T1–T6', 'CA', false),
  ('aa000000-1012-6000-0000-000000000003', 'peer', 'removed', 'Former reader', '1980-01-01', 'T1–T6', 'CA', false);
insert into public.data_feeds (id, name, feed_url, feed_type)
values ('aa000000-1012-6000-0000-000000000010', 'Calendar probe', 'https://example.com/calendar-probe', 'norcalsci-events');
insert into public.event_series (id, feed_id, series_key, title)
values ('aa000000-1012-6000-0000-000000000011', 'aa000000-1012-6000-0000-000000000010', 'calendar-probe', 'Private series');
insert into public.events (id, feed_id, external_id, series_id, title, start_time)
values ('aa000000-1012-6000-0000-000000000012', 'aa000000-1012-6000-0000-000000000010', 'calendar-probe', 'aa000000-1012-6000-0000-000000000011', 'Private event', now() + interval '1 day');
insert into public.tags (id, slug, name)
values ('aa000000-1012-6000-0000-000000000013', 'calendar-probe', 'Calendar probe');
insert into public.event_tags (event_id, tag_id)
values ('aa000000-1012-6000-0000-000000000012', 'aa000000-1012-6000-0000-000000000013');
insert into public.event_rsvps (event_id, member_id, status) values
  ('aa000000-1012-6000-0000-000000000012', 'aa000000-1012-6000-0000-000000000001', 'going'),
  ('aa000000-1012-6000-0000-000000000012', 'aa000000-1012-6000-0000-000000000002', 'interested');

create function pg_temp.check_calendar(visible boolean) returns void
language plpgsql as $$
begin
  if (exists(select id from public.events where id = 'aa000000-1012-6000-0000-000000000012')) <> visible
    then raise exception 'Event visibility is wrong'; end if;
  if (exists(select id from public.event_series where id = 'aa000000-1012-6000-0000-000000000011')) <> visible
    then raise exception 'Series visibility is wrong'; end if;
  if (exists(select event_id from public.event_tags where event_id = 'aa000000-1012-6000-0000-000000000012')) <> visible
    then raise exception 'Tag-link visibility is wrong'; end if;
end;
$$;

\echo '1. anon: no events, series, tag links, or RSVP counts'
set local role anon;
select pg_temp.check_calendar(false);
do $$ begin
  perform event_id from public.event_rsvp_counts;
  raise exception 'Anonymous RSVP counts leaked';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot read counts';
end $$;
reset role;

\echo '2. signed-in nonmember: no calendar rows or counts'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-1012-6000-0000-000000000099","role":"authenticated"}';
select pg_temp.check_calendar(false);
do $$ begin
  if exists(select event_id from public.event_rsvp_counts) then raise exception 'Nonmember counts leaked'; end if;
end $$;

\echo '3. active member: reads calendar and counts BOTH members'
set local request.jwt.claims = '{"sub":"aa000000-1012-6000-0000-000000000001","role":"authenticated"}';
select pg_temp.check_calendar(true);
do $$ begin
  if not exists(select 1 from public.event_rsvp_counts where event_id = 'aa000000-1012-6000-0000-000000000012' and going_count = 1 and interested_count = 1)
    then raise exception 'Member RSVP counts lost other members'; end if;
end $$;

\echo '4. removed member: no calendar rows or counts'
set local request.jwt.claims = '{"sub":"aa000000-1012-6000-0000-000000000003","role":"authenticated"}';
select pg_temp.check_calendar(false);
do $$ begin
  if exists(select event_id from public.event_rsvp_counts) then raise exception 'Removed member counts leaked'; end if;
end $$;
reset role;

\echo '5. service role: ingestion can still read and update events'
set local role service_role;
select pg_temp.check_calendar(true);
update public.events set title = 'Updated private event' where id = 'aa000000-1012-6000-0000-000000000012';
do $$ begin
  if not exists(select 1 from public.events where id = 'aa000000-1012-6000-0000-000000000012' and title = 'Updated private event')
    then raise exception 'Ingest cannot update events'; end if;
end $$;
reset role;

\echo 'PASS: calendar privacy and member/ingest access'
rollback;
