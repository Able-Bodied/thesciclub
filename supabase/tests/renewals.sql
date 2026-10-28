-- ============================================================================
-- Everything the club renews (20261028200000).
-- ============================================================================
-- Run as signed-in roles, with current_user printed. Expected refusals each
-- sit in their own savepoint.
--
-- What matters most: only an administrator reads the list or changes it
-- (1–6), the Apple secret's date stays in sign_in_secrets (8–9), and every
-- dated item is reminded on the reminder days, once a day (11–14).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/renewals.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-8989-0000-0000-00000000000a', 'peer',   'active', 'Member', '19990000190', '1980-01-01', 'T1–T6', 'CA', false),
  ('eeeeeeee-8989-0000-0000-00000000000e', 'mentor', 'active', 'Admin',  '19990000194', '1984-01-01', 'C5–C8', 'CA', true);

select decrypted_secret as reminder_secret
  from vault.decrypted_secrets where name = 'sign_in_reminder_secret' \gset
select id as github_id from public.renewals where name = 'GitHub token for address lookups' \gset
select id as apple_id from public.renewals where sign_in_provider = 'apple' \gset
select id as apns_id from public.renewals where name = 'Apple push notification key' \gset

\echo ''
\echo '== 1. a member cannot read the list (expect 0) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8989-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;
select count(*) from public.renewals;

\echo ''
\echo '== 2. nor write it directly (expect three ERRORs: permission denied for table renewals) =='
savepoint s2a;
insert into public.renewals (name) values ('Sneaked in');
rollback to savepoint s2a;
savepoint s2b;
update public.renewals set expires_on = current_date + 400;
rollback to savepoint s2b;
savepoint s2c;
delete from public.renewals;
rollback to savepoint s2c;

\echo ''
\echo '== 3. nor through the functions (expect two ERRORs: Only an administrator can do that.) =='
savepoint s3a;
select public.admin_set_renewal_date(:'github_id', current_date + 300);
rollback to savepoint s3a;
savepoint s3b;
select public.admin_add_renewal('Sneaked in', '', '{}', true, null);
rollback to savepoint s3b;

\echo ''
\echo '== 4. signed out, nothing at all (expect three ERRORs: permission denied) =='
set local role anon;
select current_user;
savepoint s4a;
select count(*) from public.renewals;
rollback to savepoint s4a;
savepoint s4b;
select public.admin_set_renewal_date(:'github_id', current_date + 300);
rollback to savepoint s4b;
savepoint s4c;
select public.admin_add_renewal('Sneaked in', '', '{}', true, null);
rollback to savepoint s4c;

\echo ''
\echo '== 5. an administrator reads the list, Apple''s date through sign_in_secrets (expect six rows; the Apple secret | apple | 2027-04-09) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-8989-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;
select r.name, r.sign_in_provider, coalesce(s.expires_on, r.expires_on) as runs_out, r.expires
  from public.renewals r left join public.sign_in_secrets s on s.provider = r.sign_in_provider
 order by r.name;

\echo ''
\echo '== 6. but writes only through the functions (expect ERROR: permission denied for table renewals) =='
savepoint s6;
update public.renewals set expires_on = current_date + 400 where id = :'github_id';
rollback to savepoint s6;

\echo ''
\echo '== 7. an administrator sets a date (expect t | t | t: the new date, by them, reminder cleared) =='
select public.admin_set_renewal_date(:'github_id', current_date + 365);
select expires_on = current_date + 365 as new_date,
       renewed_by = 'eeeeeeee-8989-0000-0000-00000000000e' as by_admin,
       last_reminded_on is null as reminder_cleared
  from public.renewals where id = :'github_id';

\echo ''
\echo '== 8. the Apple secret''s date goes to sign_in_secrets, none kept here (expect t | t) =='
select public.admin_set_renewal_date(:'apple_id', current_date + 180);
select (select expires_on from public.sign_in_secrets where provider = 'apple') = current_date + 180 as in_sign_in_secrets,
       (select expires_on from public.renewals where id = :'apple_id') is null as none_here;

\echo ''
\echo '== 9. with Apple''s own six-month check (expect ERROR: The date should be in the next six months) =='
savepoint s9;
select public.admin_set_renewal_date(:'apple_id', current_date + 300);
rollback to savepoint s9;

\echo ''
\echo '== 10. refused: a date gone, one past ten years, a date on what never runs out (expect three ERRORs: after today and within ten years ×2, never runs out) =='
savepoint s10a;
select public.admin_set_renewal_date(:'github_id', current_date - 1);
rollback to savepoint s10a;
savepoint s10b;
select public.admin_set_renewal_date(:'github_id', current_date + 4000);
rollback to savepoint s10b;
savepoint s10c;
select public.admin_set_renewal_date(:'apns_id', current_date + 30);
rollback to savepoint s10c;

\echo ''
\echo '== 11. an administrator adds one, blank steps dropped, order kept (expect Spare key | {One,Two} | t | by them) =='
select public.admin_add_renewal('  Spare key ', 'For testing', array['One', '  ', 'Two'], true, current_date + 30) as spare_id \gset
select name, steps, expires_on = current_date + 30 as dated,
       created_by = 'eeeeeeee-8989-0000-0000-00000000000e' as by_admin
  from public.renewals where id = :'spare_id';

\echo ''
\echo '== 12. not twice by name, nor with no name (expect two ERRORs: already one called that, Give it a name) =='
savepoint s12a;
select public.admin_add_renewal('spare KEY', '', '{}', true, null);
rollback to savepoint s12a;
savepoint s12b;
select public.admin_add_renewal('   ', '', '{}', true, null);
rollback to savepoint s12b;

\echo ''
\echo '== 13. a signed-in account cannot ask what is due (expect ERROR: permission denied for function) =='
savepoint s13;
select * from public.renewals_due(:'reminder_secret');
rollback to savepoint s13;

\echo ''
\echo '== 14. the service role without the secret is refused (expect ERROR: Not the reminder.) =='
set local role service_role;
select current_user;
savepoint s14;
select * from public.renewals_due('not-the-secret');
rollback to savepoint s14;

\echo ''
\echo '== 15. thirty days out, Apple and the added one, once that day (expect apple | Sign in with Apple secret | 30 and  | Spare key | 30; then 0) =='
set local role postgres;
update public.sign_in_secrets set expires_on = current_date + 30, last_reminded_on = null;
update public.renewals set expires_on = current_date + 200 where id = :'github_id';
set local role service_role;
select provider, name, days_left from public.renewals_due(:'reminder_secret') order by name;
select count(*) from public.renewals_due(:'reminder_secret');

\echo ''
\echo '== 16. nor again through the old call the deployed function still makes (expect 0) =='
select count(*) from public.sign_in_secret_due(:'reminder_secret');

\echo ''
\echo '== 17. after the date, every day until renewed; never an undated one (expect  | GitHub token for address lookups | -2) =='
set local role postgres;
update public.renewals set expires_on = current_date - 2, last_reminded_on = current_date - 1 where id = :'github_id';
set local role service_role;
select provider, name, days_left from public.renewals_due(:'reminder_secret');

rollback;
