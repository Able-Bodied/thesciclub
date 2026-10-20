-- ============================================================================
-- A member an administrator removed can be invited and join again
-- ============================================================================
-- 20261020010000: admin_delete_member deletes the sign-in account too. Before
-- it, the account stayed, so a fresh invite showed "signed up, never finished
-- joining" and a sign-up with the address got no confirmation email.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/removed-member-can-rejoin.sql
--
-- Rolls back. Run on a fresh stack, never the hosted project. Every step
-- raises a notice PASS or stops with what went wrong.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- Setup, as the superuser: a member with a confirmed address, joined on an
-- invite from alfred@ (the seeded administrator), with a session and a like.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-7777-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'rejoin@local.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('aaaaaaaa-7777-0000-0000-0000000000aa', 'aaaaaaaa-7777-0000-0000-000000000001', now(), now());
insert into public.invites (id, email, invited_by_member_id, status, claimed_by, claimed_at, consumed_at)
values ('aaaaaaaa-7777-0000-0000-0000000000ff', 'rejoin@local.test', 'a1000000-0000-4000-8000-000000000001',
        'consumed', 'aaaaaaaa-7777-0000-0000-000000000001', now(), now());
insert into public.members (id, type, status, display_name, birth_date, level_range, state, invite_id)
values ('aaaaaaaa-7777-0000-0000-000000000001', 'peer', 'active', 'Rejoiner', '1980-01-01', 'T1–T6', 'CA',
        'aaaaaaaa-7777-0000-0000-0000000000ff');

-- The administrator removes them.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.admin_delete_member('aaaaaaaa-7777-0000-0000-000000000001');
reset role;

do $$
begin
  assert not exists (select 1 from public.members where id = 'aaaaaaaa-7777-0000-0000-000000000001'),
    'the member row stayed';
  assert not exists (select 1 from auth.users where id = 'aaaaaaaa-7777-0000-0000-000000000001'),
    'the sign-in account stayed';
  assert not exists (select 1 from auth.sessions where user_id = 'aaaaaaaa-7777-0000-0000-000000000001'),
    'a session stayed';
  assert (select status from public.invites where id = 'aaaaaaaa-7777-0000-0000-0000000000ff') = 'revoked',
    'the invite they joined on is still live';
  raise notice 'PASS: removed, account and sessions gone, their invite revoked';
end;
$$;

-- Invited again: Admin must see an unused invite, not an unfinished sign-up.
insert into public.invites (id, email, invited_by_member_id)
values ('aaaaaaaa-7777-0000-0000-0000000000fe', 'rejoin@local.test', 'a1000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  assert (select has_account from public.admin_invites where id = 'aaaaaaaa-7777-0000-0000-0000000000fe') is false,
    'the new invite reads as somebody who signed up and never finished';
  raise notice 'PASS: invited again, the invite is not used yet';
end;
$$;

-- An administrator is still refused, account and all.
do $$
begin
  begin
    perform public.admin_delete_member('a1000000-0000-4000-8000-000000000001');
    raise exception 'an administrator deleted themself';
  exception when others then
    if sqlerrm not like '%cannot delete your own account%' then raise; end if;
  end;
  raise notice 'PASS: an administrator cannot remove themself';
end;
$$;
reset role;
do $$
begin
  assert exists (select 1 from auth.users where id = 'a1000000-0000-4000-8000-000000000001'),
    'the administrator''s account went';
end;
$$;

rollback;
