-- ============================================================================
-- Can a mentor actually issue their invites? Run as a mentor, under RLS.
-- ============================================================================
-- CONTEXT.md promises a mentor can put a fixed number of numbers on the club's
-- list — ten, since 20260917010000, and two before that — and three policies on
-- `invites` say they can. Nothing had ever run them. The
-- other probe in this directory, invite-lifecycle.sql, connects as the
-- superuser — which is BYPASSRLS, so every policy in it is inert. It exercises
-- the constraints and the triggers and says nothing at all about who may write.
--
-- This one switches to the `authenticated` role and sets request.jwt.claims,
-- which is what PostgREST does for a signed-in member, so auth.uid() answers
-- and the policies are the only thing deciding each statement. That is the
-- difference that matters: every refusal below is a policy refusing, not a
-- constraint.
--
-- Run it against a local stack:
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/mentor-invites.sql
--
-- It rolls back, so it leaves nothing behind and is safe to re-run. Do not
-- point it at the hosted project.
--
-- Every step prints what it should say. The refusals are the load-bearing
-- half — a policy that silently permits everything passes a test that only
-- checks the happy path, which is how six of this project's tests have managed
-- to pass by not running.
--
-- The control against that here is steps 1, 2, 4 and 11: the same insert, by
-- the same mentor, succeeds twice, is then refused, and succeeds again once a
-- slot is freed. Nothing differs between them but the live count, so the cap
-- is demonstrably what is answering — not a typo in a phone number, and not a
-- role that cannot write at all. Step 0 prints current_user for the same
-- reason: if this file ever runs as the superuser again, every refusal below
-- turns into a pass and the whole probe becomes worthless.
--
-- Nothing here writes the allowance as a figure. Step 2b fills whatever is left
-- of it from mentor_invite_limit(), so raising the limit does not turn "the
-- next one is refused" into a step that quietly passes because there was room
-- all along. That is exactly what happened when the owner raised it to ten: the
-- old step 4 inserted a third invite and succeeded, and the refusal it was
-- named for never ran.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Written as the superuser, before the role switch. These rows are the
-- situation, not the thing under test.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'mentor', 'active',    'Mentor A',  '19990000001', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'mentor', 'active',    'Mentor B',  '19990000002', '1981-01-01', 'T1–T6', 'CA'),
  ('cccccccc-0000-0000-0000-000000000003', 'peer',   'active',    'Peer C',    '19990000003', '1982-01-01', 'C5–C8', 'CA'),
  ('dddddddd-0000-0000-0000-000000000004', 'mentor', 'suspended', 'Mentor D',  '19990000004', '1983-01-01', 'C5–C8', 'CA');

-- A seeded profile, for the claim test further down.
insert into public.members (id, type, display_name, phone, birth_date, level_range, state, is_seed)
values ('eeeeeeee-0000-0000-0000-000000000005', 'peer', 'Seeded Person', '19990000005',
        '1984-01-01', 'C5–C8', 'CA', true);

-- An invite belonging to somebody else, so "can a mentor read the list" has
-- something to fail to read.
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550001', 'bbbbbbbb-0000-0000-0000-000000000002');

-- ------------------------------------------------------- become Mentor A
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in mentor, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-0000-0000-0000-000000000001 | f'
select current_user, auth.uid()::text as uid, public.is_admin() as admin;

\echo ''
\echo '== 1. the first invite goes on the list (expect INSERT 0 1) =='
savepoint s1;
insert into public.invites (phone_raw, invited_by_member_id, note)
values ('(408) 555-0112', 'aaaaaaaa-0000-0000-0000-000000000001', 'first');

\echo ''
\echo '== 2. so does the second (expect INSERT 0 1) =='
insert into public.invites (phone_raw, invited_by_member_id, note)
values ('408 555 0113', 'aaaaaaaa-0000-0000-0000-000000000001', 'second');

\echo ''
\echo '== 2b. fill whatever is left of the allowance =='
\echo '   Generated rather than written out, so this step stays honest whatever'
\echo '   mentor_invite_limit() says. Numbers from 14085559000 up, well clear of'
\echo '   the fixed ones the later steps name.'
insert into public.invites (phone_raw, invited_by_member_id, note)
select '1408555' || (9000 + n)::text, 'aaaaaaaa-0000-0000-0000-000000000001', 'filler'
  from generate_series(1, public.mentor_invite_limit() - 2) as n;

\echo ''
\echo '== 3. the allowance is spent (expect the two to match) =='
select public.live_invite_count(auth.uid()) as live_count, public.mentor_invite_limit() as the_limit;

\echo ''
\echo '== 4. one past the allowance is refused (expect: new row violates row-level security) =='
savepoint one_too_many;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550114', 'aaaaaaaa-0000-0000-0000-000000000001');
rollback to savepoint one_too_many;

\echo ''
\echo '== 5. they see their own invites, and only those (expect the limit) =='
\echo '   14085550001 is Mentor B''s and must not appear.'
select count(*) as mine from public.invites;
select phone, status, note from public.invites where note is distinct from 'filler' order by phone;

\echo ''
\echo '== 6. an invite cannot carry a claim on a seeded profile =='
\echo '   expect: new row violates row-level security'
savepoint claim;
update public.invites
   set seed_member_id = 'eeeeeeee-0000-0000-0000-000000000005'
 where phone = '14085550112';
rollback to savepoint claim;

\echo ''
\echo '== 7. they cannot issue an invite in another mentor''s name =='
\echo '   expect: new row violates row-level security'
savepoint forge;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550115', 'bbbbbbbb-0000-0000-0000-000000000002');
rollback to savepoint forge;

\echo ''
\echo '== 8. they cannot revoke an invite that is not theirs (expect UPDATE 0) =='
savepoint others;
update public.invites set status = 'revoked', revoked_at = now()
 where phone = '14085550001';
rollback to savepoint others;

\echo ''
\echo '== 9. withdrawing their own pending invite works (expect UPDATE 1) =='
update public.invites set status = 'revoked', revoked_at = now()
 where phone = '14085550113' and status = 'pending';

\echo ''
\echo '== 10. and returns the slot (expect one under the limit) =='
select public.live_invite_count(auth.uid()) as live_count, public.mentor_invite_limit() as the_limit;

\echo ''
\echo '== 11. so a fresh invite fits again (expect INSERT 0 1) =='
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550116', 'aaaaaaaa-0000-0000-0000-000000000001');

\echo ''
\echo ''
\echo '== 12. a revoked invite cannot be brought back to life (expect UPDATE 0) =='
\echo '   This is the way round the cap, if there is one: withdraw an invite,'
\echo '   spend the freed slot, then flip the withdrawn row back to pending and'
\echo '   hold one more than the limit. The update policy only sees pending rows,'
\echo '   so the revoked one is not theirs to touch.'
savepoint resurrect;
update public.invites set status = 'pending', revoked_at = null
 where phone = '14085550113';
select public.live_invite_count(auth.uid()) as live_count_after;
rollback to savepoint resurrect;

\echo ''
\echo '== 13. a number already on the list is refused (expect: duplicate key) =='
\echo '   Not a policy this time — invites_live_phone_idx. The number belongs'
\echo '   to Mentor B''s invite, which this mentor cannot see, so the screen has'
\echo '   to turn an opaque 23505 into a sentence.'
\echo ''
\echo '   Order matters here, and it caught this probe out: with the allowance'
\echo '   already full, the same statement fails the *cap* instead and never'
\echo '   reaches the index. So a mentor can get either error for the same'
\echo '   action, and the screen cannot read "refused" as "that number is'
\echo '   taken". The slot is freed first so the index is what answers.'
savepoint dupe;
update public.invites set status = 'revoked', revoked_at = now()
 where phone = '14085550116' and status = 'pending';
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550001', 'aaaaaaaa-0000-0000-0000-000000000001');
rollback to savepoint dupe;

\echo '== 14. a consumed invite cannot be withdrawn (expect UPDATE 0) =='
\echo '   Somebody is on that number; taking it back is a deletion, not a'
\echo '   withdrawal, and that is an administrator''s job.'
savepoint consumed;
set local role postgres;
update public.invites set status = 'consumed', consumed_at = now()
 where phone = '14085550112';
set local role authenticated;
update public.invites set status = 'revoked', revoked_at = now()
 where phone = '14085550112';
rollback to savepoint consumed;

-- ----------------------------------------------------- the other two roles
\echo ''
\echo '== 15. an ordinary peer cannot invite anybody =='
\echo '   expect: new row violates row-level security'
savepoint peer;
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550117', 'cccccccc-0000-0000-0000-000000000003');
rollback to savepoint peer;

\echo ''
\echo '== 16. a suspended mentor cannot invite anybody =='
\echo '   expect: new row violates row-level security'
savepoint suspended;
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550118', 'dddddddd-0000-0000-0000-000000000004');
rollback to savepoint suspended;

\echo ''
\echo '== 17. a signed-out visitor cannot invite anybody =='
\echo '   expect: new row violates row-level security'
savepoint anon;
set local role postgres;
set local request.jwt.claims = '';
set local role anon;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550119', 'aaaaaaaa-0000-0000-0000-000000000001');
rollback to savepoint anon;

set local role postgres;
rollback;
