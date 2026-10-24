-- ============================================================================
-- The store app's device tokens (20261023030000)
-- ============================================================================
-- Ada turns notifications on in the iPhone app; Bo is another member; Pat is
-- paused.
--
--   1. the token is kept as apns:<environment>:<lowercase hex>, once per device
--   2. what is not a token, or not an environment, is refused; anon cannot call
--   3. nobody reads or deletes another member's token
--   4. the iPhone changes hands: it notifies the new holder only
--   5. a paused member cannot turn it on
--   6. the table's checks: an app row has no keys, a browser row needs both
--   7. push_owed reaches the app row, and a block stops it as it does a browser
--   8. push_forget forgets an app token; deleting the member deletes the rest
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/push-app-tokens.sql
--
-- One transaction, rolled back. Each step raises if it fails and prints PASS
-- if it holds; each expected refusal is its own sub-block (a savepoint).
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
('a99a0000-0000-0000-0000-00000000000a','peer','active','Ada App','19990230001','1980-01-01','T1–T6','CA',true),
('a99a0000-0000-0000-0000-00000000000b','peer','active','Bo App','19990230002','1980-01-01','T1–T6','CA',true),
('a99a0000-0000-0000-0000-00000000000d','peer','suspended','Pat App','19990230003','1980-01-01','T1–T6','CA',true);

set local role authenticated;

\echo ''
\echo '== 0. a signed-in member, not the superuser =='
\echo '   expect: authenticated | a99a...000a'
select set_config('request.jwt.claims','{"sub":"a99a0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select current_user, auth.uid();

\echo ''
\echo '== 1. Ada turns notifications on in the app =='
-- As the plugin hands a token over: 32 bytes, uppercase hex.
\echo '   expect: PASS 1 (one production row, lowercase, no keys; twice is once; a sandbox token is another row)'
do $$
begin
  perform public.push_subscribe_app(
    '5A0B6C1D2E3F405162738495A6B7C8D9EAFB0C1D2E3F405162738495A6B7C8D9', 'production', 'TheSciClub/1.0');
  perform public.push_subscribe_app(
    '5A0B6C1D2E3F405162738495A6B7C8D9EAFB0C1D2E3F405162738495A6B7C8D9', 'production', 'TheSciClub/1.0');
  assert (select count(*) from public.push_subscriptions) = 1, 'not one row';
  assert (select endpoint from public.push_subscriptions)
    = 'apns:production:5a0b6c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d9', 'wrong endpoint';
  assert (select p256dh is null and auth is null and member_id = auth.uid() from public.push_subscriptions),
    'keys or member wrong';
  perform public.push_subscribe_app(repeat('ab', 32), 'sandbox');
  assert (select count(*) from public.push_subscriptions where endpoint like 'apns:sandbox:%') = 1, 'no sandbox row';
  raise notice 'PASS 1: kept once, lowercase, no keys; sandbox apart';
end;
$$;

\echo ''
\echo '== 2. what is not a token is refused =='
\echo '   expect: PASS 2 (five refusals, no direct insert, anon cannot call)'
do $$
declare
  bad text[][] := array[
    array[repeat('ab', 32), 'development'],
    array[repeat('ab', 31), 'production'],
    array[repeat('zz', 32), 'production'],
    array[repeat('ab', 32) || ':x', 'production'],
    array['', 'production']
  ];
  i int;
begin
  for i in 1 .. array_length(bad, 1) loop
    begin
      perform public.push_subscribe_app(bad[i][1], bad[i][2]);
      raise exception 'accepted % / %', bad[i][1], bad[i][2];
    exception when raise_exception then
      if sqlerrm like 'accepted%' then raise; end if;
    end;
  end loop;
  begin
    perform public.push_subscribe_app(null, 'production');
    raise exception 'accepted a null token';
  exception when raise_exception then
    if sqlerrm like 'accepted%' then raise; end if;
  end;
  begin
    insert into public.push_subscriptions (endpoint, member_id)
    values ('apns:production:' || repeat('cd', 32), auth.uid());
    raise exception 'inserted directly';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.push_subscribe_app(text,text,text)', 'execute'),
    'anon may subscribe';
  assert (select count(*) from public.push_subscriptions) = 2, 'a refusal left a row';
  raise notice 'PASS 2: refused, refused, refused';
end;
$$;

\echo ''
\echo '== 3. Bo cannot read or delete Ada''s token =='
\echo '   expect: visible 0, DELETE 0, then ada_still_has 2'
select set_config('request.jwt.claims','{"sub":"a99a0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select count(*) as visible from public.push_subscriptions;
delete from public.push_subscriptions;
reset role;
select count(*) as ada_still_has from public.push_subscriptions
 where member_id = 'a99a0000-0000-0000-0000-00000000000a';
set local role authenticated;

\echo ''
\echo '== 4. the iPhone changes hands =='
\echo '   expect: bo_holds 1, then ada_keeps sandbox'
select public.push_subscribe_app(
  '5a0b6c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d9', 'production');
select count(*) as bo_holds from public.push_subscriptions where endpoint like 'apns:production:%';
reset role;
select string_agg(split_part(endpoint, ':', 2), ',') as ada_keeps from public.push_subscriptions
 where member_id = 'a99a0000-0000-0000-0000-00000000000a';
set local role authenticated;

\echo ''
\echo '== 5. a paused member cannot turn it on =='
\echo '   expect: ERROR  Notifications cannot be turned on while your membership is paused.'
select set_config('request.jwt.claims','{"sub":"a99a0000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as pat;
savepoint paused;
select public.push_subscribe_app(repeat('ef', 32), 'production');
rollback to savepoint paused;

\echo ''
\echo '== 6. the table''s checks =='
\echo '   expect: PASS 6 (keys on an app row, a browser row without keys, an apns: endpoint through push_subscribe: all refused)'
reset role;
do $$
begin
  begin
    insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
    values ('apns:production:' || repeat('cd', 32), 'a99a0000-0000-0000-0000-00000000000b',
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            'tBHItJI5svbpez7KI4CCXg');
    raise exception 'an app row took keys';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_subscriptions (endpoint, member_id)
    values ('https://web.push.apple.com/no-keys', 'a99a0000-0000-0000-0000-00000000000b');
    raise exception 'a browser row went without keys';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_subscriptions (endpoint, member_id)
    values ('apns:production:' || repeat('cd', 32) || '/../x', 'a99a0000-0000-0000-0000-00000000000b');
    raise exception 'a token with a path went in';
  exception when check_violation then null;
  end;
  begin
    perform set_config('request.jwt.claims','{"sub":"a99a0000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
    perform public.push_subscribe('apns:production:' || repeat('cd', 32),
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      'tBHItJI5svbpez7KI4CCXg');
    raise exception 'push_subscribe took an app endpoint';
  exception when raise_exception then
    if sqlerrm like 'push_subscribe took%' then raise; end if;
  end;
  raise notice 'PASS 6: an app row has no keys, a browser row has both';
end;
$$;

\echo ''
\echo '== 7. push_owed reaches the app, and a block stops it =='
\echo '   expect: PASS 7 (Bo''s message owed to Ada''s app row; nothing once Ada blocks Bo)'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a99a0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.chat_open_direct('a99a0000-0000-0000-0000-00000000000a') as dm \gset
insert into public.chat_messages (thread_id, author_id, body) values (:'dm', auth.uid(), 'Bo to Ada')
returning id as message \gset
reset role;
select set_config('probe.secret', :'secret', true) is not null as s,
       set_config('probe.message', :'message', true) is not null as m;
do $$
declare
  owed text;
begin
  select string_agg(o.endpoint || '|' || coalesce(o.p256dh, 'none') || '|' || o.kind, ',') into owed
    from public.push_owed(current_setting('probe.secret'), 'message',
                          jsonb_build_object('id', current_setting('probe.message'))) o;
  assert owed = 'apns:sandbox:' || repeat('ab', 32) || '|none|direct', format('owed: %s', owed);

  insert into public.member_blocks (blocker_id, blocked_id)
  values ('a99a0000-0000-0000-0000-00000000000a', 'a99a0000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.push_owed(current_setting('probe.secret'), 'message',
            jsonb_build_object('id', current_setting('probe.message')))) = 0, 'a block did not stop it';
  raise notice 'PASS 7: owed to the app; a block stops it';
end;
$$;

\echo ''
\echo '== 8. forgotten when Apple says so, and with the account =='
\echo '   expect: PASS 8'
do $$
begin
  -- push_forget leaves a row made in the last ten minutes (20260927020000).
  update public.push_subscriptions set created_at = now() - interval '1 hour'
   where member_id = 'a99a0000-0000-0000-0000-00000000000b';
  perform public.push_forget(current_setting('probe.secret'),
    array['apns:production:5a0b6c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d9']);
  assert (select count(*) from public.push_subscriptions
           where member_id = 'a99a0000-0000-0000-0000-00000000000b') = 0, 'push_forget kept it';
  delete from public.members where id = 'a99a0000-0000-0000-0000-00000000000a';
  assert (select count(*) from public.push_subscriptions
           where member_id = 'a99a0000-0000-0000-0000-00000000000a') = 0, 'the account''s token stayed';
  raise notice 'PASS 8: forgotten both ways';
end;
$$;

rollback;
