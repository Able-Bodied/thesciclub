-- ============================================================================
-- Sign in with Apple is revoked when the account goes (20261022160000)
-- ============================================================================
-- Apple refresh tokens sit in private.apple_tokens, which nobody reads through
-- the API: not a member, not an administrator, not anon, not even the service
-- role (it writes through apple_token_keep only). Deleting an Apple identity,
-- by deleting the account either way or by unlinking, queues its tokens and
-- asks the apple-revoke function. The function is a stub here: the vault's
-- apple_revoke_url points at a closed port, and what is checked is the
-- request pg_net queued, never a call to Apple. Only a caller holding the
-- vault's apple_revoke_secret may claim the queue (17b–18).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/apple-revocation.sql
--
-- Rolls back. Each expected refusal has its own savepoint. Do not point it at
-- the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Leaver deletes themselves; Removed is removed by Admin; Linker unlinks
-- Apple; Other keeps theirs.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1600-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leaver@probe.test', now()),
  ('bbbbbbbb-1600-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'removed@probe.test', now()),
  ('cccccccc-1600-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'linker@probe.test', now()),
  ('dddddddd-1600-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@probe.test', now()),
  ('eeeeeeee-1600-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test', now());

insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('apple.leaver',  'aaaaaaaa-1600-0000-0000-000000000001', '{"sub":"apple.leaver"}',  'apple'),
  ('apple.removed', 'bbbbbbbb-1600-0000-0000-000000000002', '{"sub":"apple.removed"}', 'apple'),
  ('apple.linker',  'cccccccc-1600-0000-0000-000000000003', '{"sub":"apple.linker"}',  'apple'),
  ('apple.other',   'dddddddd-1600-0000-0000-000000000004', '{"sub":"apple.other"}',   'apple');

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1600-0000-0000-000000000001', 'peer', 'active', 'Leaver',  '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-1600-0000-0000-000000000002', 'peer', 'active', 'Removed', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-1600-0000-0000-000000000003', 'peer', 'active', 'Linker',  '1982-01-01', 'C5–C8', 'CA', false),
  ('dddddddd-1600-0000-0000-000000000004', 'peer', 'active', 'Other',   '1983-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-1600-0000-0000-000000000005', 'peer', 'active', 'Admin',   '1984-01-01', 'T1–T6', 'CA', true);

-- The stub: a closed port. pg_net only queues inside this transaction.
select vault.create_secret('http://127.0.0.1:9/apple-revoke-stub', 'apple_revoke_url') is not null as stub;

-- What apple_revoke_send sends; the service role cannot read the vault.
select s.decrypted_secret as revoke_secret
  from vault.decrypted_secrets s where s.name = 'apple_revoke_secret' \gset

create temporary view probe_state as
select
  (select count(*) from private.apple_tokens where apple_sub like 'apple.%') as tokens,
  (select count(*) from private.apple_revocations where refresh_token like 'rt-%') as queued,
  (select count(*) from net.http_request_queue where url = 'http://127.0.0.1:9/apple-revoke-stub') as asked;

\echo ''
\echo '== 1. the service role keeps a token for the account''s own identity (expect t | t | t | t) =='
set local role service_role;
select public.apple_token_keep('aaaaaaaa-1600-0000-0000-000000000001', 'apple.leaver',  'com.thesciclub.app', 'rt-leaver'),
       public.apple_token_keep('bbbbbbbb-1600-0000-0000-000000000002', 'apple.removed', 'com.thesciclub.web', 'rt-removed'),
       public.apple_token_keep('cccccccc-1600-0000-0000-000000000003', 'apple.linker',  'com.thesciclub.app', 'rt-linker'),
       public.apple_token_keep('dddddddd-1600-0000-0000-000000000004', 'apple.other',   'com.thesciclub.app', 'rt-other');

\echo ''
\echo '== 2. ...but not for an Apple identity that is somebody else''s (expect f) =='
select public.apple_token_keep('aaaaaaaa-1600-0000-0000-000000000001', 'apple.other', 'com.thesciclub.app', 'rt-stolen');

\echo ''
\echo '== 3. the same key again replaces the token, not adds one (expect t, then 4 | 0 | 0) =='
select public.apple_token_keep('aaaaaaaa-1600-0000-0000-000000000001', 'apple.leaver', 'com.thesciclub.app', 'rt-leaver');
reset role;
select * from probe_state;

\echo ''
\echo '== 4. the service role cannot read the tokens directly (expect ERROR: permission denied for schema private) =='
set local role service_role;
savepoint service_reads;
select count(*) from private.apple_tokens;
rollback to savepoint service_reads;
reset role;

\echo ''
\echo '== 5. a member cannot read them (expect ERROR: permission denied for table apple_tokens) =='
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-1600-0000-0000-000000000004","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member_reads;
select count(*) from private.apple_tokens;
rollback to savepoint member_reads;

\echo ''
\echo '== 6. ...nor the queue (expect ERROR: permission denied for table apple_revocations) =='
savepoint member_queue;
select count(*) from private.apple_revocations;
rollback to savepoint member_queue;

\echo ''
\echo '== 7. ...nor keep a token (expect ERROR: permission denied for function apple_token_keep) =='
savepoint member_keeps;
select public.apple_token_keep('dddddddd-1600-0000-0000-000000000004', 'apple.other', 'com.thesciclub.app', 'rt-mine');
rollback to savepoint member_keeps;

\echo ''
\echo '== 8. ...nor take the queue (expect ERROR: permission denied for function apple_revocations_due) =='
savepoint member_due;
select * from public.apple_revocations_due(:'revoke_secret');
rollback to savepoint member_due;
reset role;

\echo ''
\echo '== 9. an administrator cannot read the tokens (expect ERROR: permission denied for table apple_tokens) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-1600-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.is_admin() as admin;
savepoint admin_reads;
select count(*) from private.apple_tokens;
rollback to savepoint admin_reads;
reset role;

\echo ''
\echo '== 10. nor can anon (expect ERROR: permission denied for schema private) =='
set local role anon;
savepoint anon_reads;
select count(*) from private.apple_tokens;
rollback to savepoint anon_reads;
reset role;

\echo ''
\echo '== 11. Leaver deletes their account (expect one row, delete_my_account empty) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1600-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.delete_my_account();
reset role;

\echo ''
\echo '== 12. Leaver''s token is queued and the function asked once (expect 3 | 1 | 1) =='
select * from probe_state;

\echo ''
\echo '== 12b. the request carries no token, only the vault''s secret as x-revoke-secret (expect {} | t | Content-Type,x-revoke-secret) =='
select convert_from(q.body, 'utf8') as body,
       q.headers ->> 'x-revoke-secret' = :'revoke_secret' as secret_sent,
       (select string_agg(k, ',' order by k) from jsonb_object_keys(q.headers) k) as headers
  from net.http_request_queue q
 where q.url = 'http://127.0.0.1:9/apple-revoke-stub';

\echo ''
\echo '== 13. Admin removes Removed (expect one row, admin_delete_member empty) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-1600-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.admin_delete_member('bbbbbbbb-1600-0000-0000-000000000002');
reset role;

\echo ''
\echo '== 14. Removed''s web token is queued too, the function asked again (expect 2 | 2 | 2) =='
select * from probe_state;

\echo ''
\echo '== 15. Linker unlinks Apple: GoTrue deletes the identity (expect DELETE 1, then 1 | 3 | 3) =='
delete from auth.identities where provider = 'apple' and provider_id = 'apple.linker';
select * from probe_state;

\echo ''
\echo '== 16. what was queued, with the client each is revoked as (expect com.thesciclub.app rt-leaver, com.thesciclub.web rt-removed, com.thesciclub.app rt-linker) =='
select client_id, refresh_token from private.apple_revocations where refresh_token like 'rt-%' order by id;

\echo ''
\echo '== 17. Other''s token is untouched, and the queue holds no stray (expect rt-other only) =='
select refresh_token from private.apple_tokens where apple_sub like 'apple.%';

\echo ''
\echo '== 17b. a caller without the secret is refused, wrong, empty or none (expect ERROR: Not the database. three times) =='
set local role service_role;
savepoint wrong_secret;
select * from public.apple_revocations_due('not-the-secret');
rollback to savepoint wrong_secret;
savepoint empty_secret;
select * from public.apple_revocations_due('');
rollback to savepoint empty_secret;
savepoint no_secret;
select * from public.apple_revocations_due(null);
rollback to savepoint no_secret;
reset role;

\echo ''
\echo '== 17c. a wrong secret, its refusal caught in place so any claim would stay: nothing claimed, no try counted (expect NOTICE: refused: Not the database., then 3 | 0 | 0) =='
set local role service_role;
do $$
begin
  perform * from public.apple_revocations_due('not-the-secret');
  raise notice 'claimed without the secret';
exception when insufficient_privilege then
  raise notice 'refused: %', sqlerrm;
end;
$$;
reset role;
select count(*) as queued, sum(attempts) as attempts, count(last_tried_at) as tried
  from private.apple_revocations where refresh_token like 'rt-%';

\echo ''
\echo '== 18. the function, with the secret, claims all three once (expect 3, then 0) =='
set local role service_role;
create temporary table probe_due on commit drop as
  select * from public.apple_revocations_due(:'revoke_secret');
select count(*) from probe_due where refresh_token like 'rt-%';
select count(*) from public.apple_revocations_due(:'revoke_secret') where refresh_token like 'rt-%';

\echo ''
\echo '== 19. Apple accepts two, refuses one: the refused one stays with its error (expect 1 | HTTP 400 invalid_grant | 1) =='
select public.apple_revocation_done(id, null) from probe_due where refresh_token in ('rt-leaver', 'rt-removed');
select public.apple_revocation_done(id, 'HTTP 400 invalid_grant') from probe_due where refresh_token = 'rt-linker';
reset role;
select count(*) as left, max(last_error) as error, max(attempts) as attempts
  from private.apple_revocations where refresh_token like 'rt-%';

\echo ''
\echo '== 20. with no apple_revoke_url, Other''s deletion still queues, and nothing is sent (expect 0 | 2 | 3) =='
delete from vault.secrets where name = 'apple_revoke_url';
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-1600-0000-0000-000000000004","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.delete_my_account();
reset role;
select * from probe_state;

rollback;
