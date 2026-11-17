-- ============================================================================
-- A review changes for 30 days after it is posted (20261116090000)
-- ============================================================================
-- Every check raises on failure. Rolls back.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok: %', what;
end $$;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('aaaaaaaa-1611-0000-0000-00000000000a', 'peer', 'active', 'Probe Reviewer', '15105551611', '1980-01-01', 'C5–C8', 'CA');
insert into public.events (id, title, host_name, start_time) values
  ('eeeeeeee-1611-0000-0000-000000000001', 'Probe fresh', 'Probe', now() - interval '2 days'),
  ('eeeeeeee-1611-0000-0000-000000000002', 'Probe old', 'Probe', now() - interval '40 days');
insert into public.event_check_ins (event_id, member_id) values
  ('eeeeeeee-1611-0000-0000-000000000001', 'aaaaaaaa-1611-0000-0000-00000000000a'),
  ('eeeeeeee-1611-0000-0000-000000000002', 'aaaaaaaa-1611-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1611-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

select public.save_review('eeeeeeee-1611-0000-0000-000000000001', null, 3, 'Fine', false, false, '[]');
select public.save_review('eeeeeeee-1611-0000-0000-000000000002', null, 3, 'Fine', false, false, '[]');

-- The first was posted 29 days ago, the second 31.
reset role;
update public.reviews set created_at = now() - interval '29 days'
 where event_id = 'eeeeeeee-1611-0000-0000-000000000001';
update public.reviews set created_at = now() - interval '31 days'
 where event_id = 'eeeeeeee-1611-0000-0000-000000000002';
set local role authenticated;

select public.save_review('eeeeeeee-1611-0000-0000-000000000001', null, 5, 'Better', false, false, '[]');
reset role;
select pg_temp.check((select rating = 5 from public.reviews where event_id = 'eeeeeeee-1611-0000-0000-000000000001'),
  'a review changes within 30 days');
set local role authenticated;

do $$
begin
  perform public.save_review('eeeeeeee-1611-0000-0000-000000000002', null, 1, 'Changed', false, false, '[]');
  raise exception 'FAIL: a review changed after 30 days';
exception when insufficient_privilege then
  raise notice 'ok: a review does not change after 30 days';
end $$;

reset role;
create temp table old_review as select id from public.reviews where event_id = 'eeeeeeee-1611-0000-0000-000000000002';
grant select on old_review to authenticated;
set local role authenticated;
select public.delete_my_review((select id from old_review));
reset role;
select pg_temp.check(not exists (select 1 from public.reviews where event_id = 'eeeeeeee-1611-0000-0000-000000000002'),
  'it can still be deleted');

rollback;
