-- ============================================================================
-- Inviting a list: administrators only, and each address is reported
-- ============================================================================
-- 20261114010000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/invite-from-a-list.sql
--
-- Rolls back. Do not point it at the live project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1411-0000-0000-00000000000a', 'peer', 'active', 'Ada', 'ada1411', '19990114100', '1980-01-01', 'C5–C8', 'CA', true),
  ('aaaaaaaa-1411-0000-0000-00000000000b', 'peer', 'active', 'Bo',  'bo1411',  '19990114101', '1981-01-01', 'C5–C8', 'CA', false);
insert into public.invites (email, invited_by_member_id) values
  ('waiting1411@example.com', 'aaaaaaaa-1411-0000-0000-00000000000a');

-- As Bo, who is not an administrator.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1411-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. a member who is not an administrator cannot (expect ERROR: Not an administrator) =='
select public.admin_invite_list('[{"email":"new1411@example.com"}]');
reset role;

-- As Ada, an administrator.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1411-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. each address reported (expect added, repeat, on_list, not_an_email) =='
select r ->> 'email' as email, r ->> 'outcome' as outcome, r ->> 'name' as name
  from jsonb_array_elements(public.admin_invite_list(
    '[{"email":"New1411@Example.com","name":"Nia"},
      {"email":"new1411@example.com"},
      {"email":"waiting1411@example.com"},
      {"email":"not an address"}]',
    null, 'Come along')) r;
reset role;

\echo ''
\echo '== 3. the new invite is from Ada, with her words and the name (expect Ada, Nia, Come along) =='
select m.display_name, i.invitee_name, i.message
  from public.invites i join public.members m on m.id = i.invited_by_member_id
 where i.email = 'new1411@example.com';

rollback;
