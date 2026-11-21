-- ============================================================================
-- Admin → Members profile progress (20261115090000): administrators only
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

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin, city)
values
  ('aaaaaaaa-1511-0000-0000-00000000000a', 'peer', 'active', 'Probe Admin', '15105551510', '1980-01-01', 'C5–C8', 'CA', true,  'Oakland'),
  ('bbbbbbbb-1511-0000-0000-00000000000b', 'peer', 'active', 'Probe Bo',    '15105551511', '1981-01-01', 'C5–C8', 'CA', false, null);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-1511-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
do $$
begin
  perform * from public.admin_member_profiles();
  raise exception 'FAIL: a member who is not an administrator read every profile';
exception when insufficient_privilege then
  raise notice 'ok: a member who is not an administrator is refused';
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1511-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select pg_temp.check((select profile ->> 'city' = 'Oakland' and profile ? 'field_of_work'
                        from public.admin_member_profiles() where id = 'aaaaaaaa-1511-0000-0000-00000000000a'),
  'an administrator reads what the percentage needs');
select pg_temp.check((select profile is not null and not (profile ? 'phone') and not (profile ? 'birth_date')
                        from public.admin_member_profiles() where id = 'bbbbbbbb-1511-0000-0000-00000000000b'),
  'and nothing it does not need');
select pg_temp.check(not exists (select 1 from public.admin_member_profiles() p
                                   join public.members m using (id) where m.is_seed),
  'no directory entries');

reset role;
select set_config('request.jwt.claims', '', true) is not null as ok;
set local role anon;
do $$
begin
  perform * from public.admin_member_profiles();
  raise exception 'FAIL: a signed-out visitor read every profile';
exception when insufficient_privilege then
  raise notice 'ok: a signed-out visitor is refused';
end $$;

\echo 'ALL PASSED'
rollback;
