-- ============================================================================
-- What happens to an invite when the member it belongs to is deleted
-- ============================================================================
-- There is no automated database harness in this repo, and the invite table is
-- the club's gate, so this is the next best thing: one transaction that sets up
-- the situation, prints what happened, and rolls back. Read the output; it is
-- labelled with what each line should say.
--
-- Run it against a local stack:
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/invite-lifecycle.sql
--
-- It rolls back, so it leaves nothing behind and is safe to re-run. Do not
-- point it at the hosted project: it writes before it rolls back, and a
-- disconnection mid-transaction is not worth the risk on real members.
--
-- Steps 3, 4 and 5 were all broken until
-- 20260912000000_free_the_number_when_a_member_is_deleted.sql: a deleted
-- member could sign back in unasked (3), their number could not be re-invited
-- on purpose (4), and deleting a mentor who held invites failed outright with
-- a check constraint violation (5).
-- ============================================================================

begin;

-- The repair that admin_delete_member performs, without its administrator
-- checks — those need a signed-in admin, and they are not what this exercises.
create or replace function pg_temp.delete_member(target uuid) returns void
language plpgsql as $$
begin
  update public.invites set status = 'revoked', revoked_at = now()
   where id = (select invite_id from public.members where id = target)
     and status in ('pending', 'consumed');
  update public.invites set status = 'revoked', revoked_at = now()
   where invited_by_member_id = target and status = 'pending';
  delete from public.members where id = target;
end; $$;

insert into public.members (id, type, display_name, phone, birth_date, level_range, state)
values ('11111111-1111-1111-1111-111111111111', 'mentor', 'Mentor', '19990000001',
        '1980-01-01', 'T1–T6', 'CA');

-- The mentor spends one invite, and that person joins.
insert into public.invites (phone_raw, invited_by_member_id)
values ('(408) 555-0112', '11111111-1111-1111-1111-111111111111');
update public.invites set status = 'consumed', consumed_at = now() where phone = '14085550112';
insert into public.members (id, type, display_name, phone, birth_date, level_range, state, invite_id)
values ('22222222-2222-2222-2222-222222222222', 'peer', 'Invitee', '14085550112',
        '1990-01-01', 'C5–C8', 'CA', (select id from public.invites where phone = '14085550112'));

-- And spends the second on somebody who has not joined yet.
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085559999', '11111111-1111-1111-1111-111111111111');

\echo ''
\echo '== both invites are live, so the mentor has none left (expect 2) =='
select public.live_invite_count('11111111-1111-1111-1111-111111111111') as live_count;

select pg_temp.delete_member('22222222-2222-2222-2222-222222222222');

\echo ''
\echo '== 1. deleting them returns the slot they were spent on (expect 1) =='
select public.live_invite_count('11111111-1111-1111-1111-111111111111') as live_count;

\echo ''
\echo '== 2. their invite is revoked, not deleted: who vouched is still on record =='
select status, revoked_at is not null as revoked, invited_by_member_id is not null as inviter_kept
  from public.invites where phone = '14085550112';

\echo ''
\echo '== 3. they cannot walk back in unasked (expect f) =='
\echo '   before the fix this was t: has_active_invite accepts consumed, so a'
\echo '   deleted member could sign in and recreate their row.'
select public.has_active_invite('4085550112') as can_still_join;

\echo ''
\echo '== 4. their number can be invited again, on purpose (expect INSERT 0 1) =='
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550112', '11111111-1111-1111-1111-111111111111');

-- Somebody takes that second chance and stays, so there is a *used* invite
-- still standing when the mentor goes. Without one, step 5 would claim a rule
-- it never demonstrated.
update public.invites set status = 'consumed', consumed_at = now()
 where phone = '14085550112' and status = 'pending';
insert into public.members (id, type, display_name, phone, birth_date, level_range, state, invite_id)
values ('33333333-3333-3333-3333-333333333333', 'peer', 'Rejoined', '14085550112',
        '1991-01-01', 'C5–C8', 'CA',
        (select id from public.invites where phone = '14085550112' and status = 'consumed'));

\echo ''
\echo '== 5. the mentor can be deleted while holding invites (expect no error) =='
select pg_temp.delete_member('11111111-1111-1111-1111-111111111111');

\echo ''
\echo '== 6. unused invites they issued are revoked; used ones are left alone =='
\echo '   expect: 14085550112 consumed (Rejoined is still a member)'
\echo '           14085559999 revoked  (nobody ever used it)'
select phone, status, invited_by_member_id is null as inviter_gone
  from public.invites
 where phone in ('14085550112', '14085559999') and status <> 'revoked'
 union all
select phone, status, invited_by_member_id is null
  from public.invites
 where phone = '14085559999'
 order by phone;

\echo ''
\echo '== 7. an invite from nobody is still refused =='
\echo '   expect: ERROR:  An invite must come from a member organization or a mentor'
savepoint no_inviter;
insert into public.invites (phone_raw) values ('4085551234');
rollback to savepoint no_inviter;

rollback;
