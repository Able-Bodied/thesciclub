-- ============================================================================
-- Apple sign-in's renewal date and its reminder (20261011080000).
-- ============================================================================
-- Run as signed-in roles, with current_user printed. Expected refusals each
-- sit in their own savepoint.
--
-- What matters most: only an administrator reads or sets the date (step 1–3),
-- only the database's own call can ask what is due (7–8), and a reminder goes
-- on the reminder days and at most once a day (9–11).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/apple-sign-in-renewal.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-8888-0000-0000-00000000000a', 'peer',   'active', 'Member', '19990000090', '1980-01-01', 'T1–T6', 'CA', false),
  ('eeeeeeee-8888-0000-0000-00000000000e', 'mentor', 'active', 'Admin',  '19990000094', '1984-01-01', 'C5–C8', 'CA', true);

select decrypted_secret as reminder_secret
  from vault.decrypted_secrets where name = 'sign_in_reminder_secret' \gset

\echo ''
\echo '== 1. a member cannot read the date (expect 0) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8888-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;
select count(*) from public.sign_in_secrets;

\echo ''
\echo '== 2. an administrator can (expect apple | 2027-04-09) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-8888-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
select provider, expires_on from public.sign_in_secrets;

\echo ''
\echo '== 3. a member cannot set it (expect ERROR: Only an administrator can do that.) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8888-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
savepoint s3;
select public.admin_renew_sign_in_secret('apple', current_date + 180);
rollback to savepoint s3;

\echo ''
\echo '== 4. nor can a member write the table directly (expect ERROR: permission denied) =='
savepoint s4;
update public.sign_in_secrets set expires_on = current_date + 400;
rollback to savepoint s4;

\echo ''
\echo '== 5. an administrator cannot set a date past six months, or one already gone (expect two ERRORs: The date should be in the next six months) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-8888-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
savepoint s5a;
select public.admin_renew_sign_in_secret('apple', current_date + 200);
rollback to savepoint s5a;
savepoint s5b;
select public.admin_renew_sign_in_secret('apple', current_date - 1);
rollback to savepoint s5b;

\echo ''
\echo '== 6. an administrator renews it (expect t | t | t: the new date, by them, reminder cleared) =='
select public.admin_renew_sign_in_secret('apple', current_date + 180);
set local role postgres;
select expires_on = current_date + 180 as new_date,
       renewed_by = 'eeeeeeee-8888-0000-0000-00000000000e' as by_admin,
       last_reminded_on is null as reminder_cleared
  from public.sign_in_secrets where provider = 'apple';

\echo ''
\echo '== 7. a signed-in account cannot ask what is due (expect ERROR: permission denied for function) =='
set local role authenticated;
select current_user;
savepoint s7;
select * from public.sign_in_secret_due(:'reminder_secret');
rollback to savepoint s7;

\echo ''
\echo '== 8. the service role without the secret is refused (expect ERROR: Not the reminder.) =='
set local role service_role;
select current_user;
savepoint s8;
select * from public.sign_in_secret_due('not-the-secret');
rollback to savepoint s8;

\echo ''
\echo '== 9. thirty days out, one reminder, and only once that day (expect apple | 30, then 0) =='
set local role postgres;
update public.sign_in_secrets set expires_on = current_date + 30, last_reminded_on = null;
set local role service_role;
select provider, days_left from public.sign_in_secret_due(:'reminder_secret');
select count(*) from public.sign_in_secret_due(:'reminder_secret');

\echo ''
\echo '== 10. twenty days out is not a reminder day (expect 0) =='
set local role postgres;
update public.sign_in_secrets set expires_on = current_date + 20, last_reminded_on = null;
set local role service_role;
select count(*) from public.sign_in_secret_due(:'reminder_secret');

\echo ''
\echo '== 11. after the date, every day until renewed (expect apple | -2) =='
set local role postgres;
update public.sign_in_secrets set expires_on = current_date - 2, last_reminded_on = current_date - 1;
set local role service_role;
select provider, days_left from public.sign_in_secret_due(:'reminder_secret');

\echo ''
\echo '== 12. with no function address in the vault, the morning run does nothing and does not fail (expect a blank row, no ERROR) =='
set local role postgres;
select public.sign_in_secret_remind();

\echo ''
\echo '== 13. the morning run is scheduled (expect sign-in-secret-reminder | 10 16 * * *) =='
select jobname, schedule from cron.job where jobname = 'sign-in-secret-reminder';

rollback;
