-- ============================================================================
-- Can a member decline a question, and are the two they may not decline safe?
-- ============================================================================
-- "Prefer not to say" completes a profile, so the column it writes is the one
-- thing standing between an honest percentage and a member who can mark their
-- own name as not-given. The check constraint is what stops the second.
--
-- Run as a real signed-in member, not as the superuser: postgres is BYPASSRLS,
-- so members' own-row policy would be inert. Every expected refusal sits in its
-- own savepoint, or the first aborts the transaction and the rest print
-- "current transaction is aborted", which in a long log reads like passing.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/declined.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-4444-0000-0000-00000000000a', 'peer', 'active', 'Decliner', '19990000050', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-4444-0000-0000-00000000000b', 'peer', 'active', 'Somebody', '19990000051', '1981-01-01', 'T1–T6', 'CA');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-4444-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are a signed-in member, not the superuser (expect authenticated) =='
select current_user, auth.uid()::text as uid;

\echo ''
\echo '== 1. nothing is declined to begin with (expect {}) =='
select declined from public.members where id = auth.uid();

\echo ''
\echo '== 2. a member can decline their own (expect UPDATE 1, then 2 keys) =='
\echo '   The survey and the details form share this column, so a survey key and'
\echo '   a details key going in together is the ordinary case, not a mixture.'
update public.members set declined = array['bio', 'photo'] where id = auth.uid();
select cardinality(declined) as keys from public.members where id = auth.uid();

\echo ''
\echo '== 3. THE RULE: the name cannot be declined (expect ERROR) =='
\echo '   Both spellings, because the survey and the details form name it'
\echo '   differently and the constraint should not depend on which one asked.'
savepoint decline_name;
update public.members set declined = array['bio', 'displayName'] where id = auth.uid();
rollback to savepoint decline_name;

savepoint decline_name2;
update public.members set declined = array['name'] where id = auth.uid();
rollback to savepoint decline_name2;

\echo ''
\echo '== 4. nor the birthday (expect ERROR, twice) =='
\echo '   The 18+ trigger cannot do its job without one.'
savepoint decline_birthday;
update public.members set declined = array['birthDate'] where id = auth.uid();
rollback to savepoint decline_birthday;

savepoint decline_birthday2;
update public.members set declined = array['photo', 'birthday'] where id = auth.uid();
rollback to savepoint decline_birthday2;

\echo ''
\echo '== 5. the earlier declines survived the refusals (expect 2) =='
\echo '   Each refusal rolled back to its own savepoint. Without them the first'
\echo '   would have aborted the transaction and every step after it would have'
\echo '   printed nothing at all, which reads exactly like a pass.'
select cardinality(declined) as keys from public.members where id = auth.uid();

\echo ''
\echo '== 6. withdrawing a decline is an ordinary write (expect UPDATE 1, then 1) =='
update public.members set declined = array['bio'] where id = auth.uid();
select cardinality(declined) as keys from public.members where id = auth.uid();

\echo ''
\echo '== 7. a member cannot decline on somebody else''s behalf (expect UPDATE 0) =='
\echo '   Not a new policy — `members` has restricted a member to their own row'
\echo '   since it was built, and this is one more column on it.'
savepoint someone_else;
update public.members set declined = array['bio']
 where id = 'bbbbbbbb-4444-0000-0000-00000000000b';
rollback to savepoint someone_else;

\echo ''
\echo '== 8. an unknown key is allowed through (expect UPDATE 1) =='
\echo '   Deliberate. This records what somebody declined to say, not what the'
\echo '   form happens to ask this month — a question that stops being asked'
\echo '   should leave a harmless row rather than fail somebody''s next save.'
\echo '   The client ignores a key it does not recognise; see details-api.test.'
update public.members set declined = array['aQuestionNobodyAsksAnyMore'] where id = auth.uid();

\echo ''
\echo '== 9. the column is not null and defaults to empty (expect NO | {}) =='
\echo '   Every reader treats this as a list, and a null would have to be'
\echo '   guarded at each one — one of them would forget.'
\echo ''
\echo '   Read as the superuser on purpose: this is a question about the'
\echo '   column, not about a row, and the first draft asked it by selecting'
\echo '   the OTHER member''s row as the signed-in one. That returns no rows,'
\echo '   because members'' own-row policy is doing its job — so the step'
\echo '   printed "(0 rows)" and proved nothing about the default.'
set local role postgres;
select is_nullable, column_default
  from information_schema.columns
 where table_name = 'members' and column_name = 'declined';

rollback;
