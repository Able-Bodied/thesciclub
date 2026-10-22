-- ============================================================================
-- A member reports another member's profile (20261022130000)
-- ============================================================================
-- Ada reports Bo's profile. Cy is another member, Dee is hidden from Peers,
-- Gus is paused, Ivy is an administrator.
--
--   1. the refusals: yourself, nobody, a hidden member, by a paused member, by
--      somebody with no member row, and not by signed-out callers
--   2. Ada's report keeps a copy of the profile; twice is once; she reads
--      back one column and no more
--   3. Bo, the reported member, and Cy cannot see the report or learn of it
--   4. Bo edits his profile, and the copy still says what it said
--   5. administrators read it as a profile report, count a second reporter,
--      are notified like any report, and settle it; a member cannot settle
--   6. the grants, and the storage policies that keep the photograph
--   7. a blocked pair cannot report each other's profile
--   8. Bo deletes his account: each copy reads "Deleted member", without his
--      @username or photograph, and keeps the words; nobody can report him
--   9. Ivy removes Hal: the same (20261022150000)
--  10. Jo, still a member, and every other report are untouched
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/profile-reports.sql
--
-- One transaction, rolled back, as signed-in roles (step 0 prints which). Each
-- expected refusal is its own sub-block, a savepoint. Read every PASS against
-- the step's expect line. A file in the photos bucket cannot be deleted from
-- SQL (storage.protect_delete); `pnpm check-photo-policy` does that through
-- the Storage API.
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin,
   username, bio, how_injured, detail, photo_path, photo_alt, interests, topics)
values
('7e0f0000-0000-0000-0000-00000000000a','peer','active','Ada Report','19990220001','1980-01-01','T1–T6','CA',true,false,
 'ada_report',null,null,null,null,null,'{}','{}'),
('7e0f0000-0000-0000-0000-00000000000b','peer','active','Bo Report','19990220002','1980-01-01','T1–T6','CA',true,false,
 'bo_report','Bo''s bio, as it was','Fell, 2009','Uses a Roho','7e0f0000-0000-0000-0000-00000000000b/profile.webp',
 'Bo at a lake','{Cycling,Chess}','{Travel}'),
('7e0f0000-0000-0000-0000-00000000000c','peer','active','Cy Report','19990220003','1980-01-01','T1–T6','CA',true,false,
 'cy_report',null,null,null,null,null,'{}','{}'),
('7e0f0000-0000-0000-0000-00000000000d','peer','active','Dee Hidden','19990220004','1980-01-01','T1–T6','CA',false,false,
 'dee_hidden','Hidden from Peers',null,null,null,null,'{}','{}'),
('7e0f0000-0000-0000-0000-00000000000e','peer','suspended','Gus Paused','19990220005','1980-01-01','T1–T6','CA',true,false,
 'gus_paused',null,null,null,null,null,'{}','{}'),
('7e0f0000-0000-0000-0000-00000000000f','peer','active','Ivy Report','19990220006','1980-01-01','T1–T6','CA',true,true,
 'ivy_report',null,null,null,null,null,'{}','{}');
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/7e0f' || right(id::text, 1), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999022000%' and id in
  ('7e0f0000-0000-0000-0000-00000000000a','7e0f0000-0000-0000-0000-00000000000f');

set local role authenticated;

\echo ''
\echo '== 0. a signed-in member, not the superuser =='
\echo '   expect: authenticated | 7e0f...000a | f'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select current_user, auth.uid(), public.is_admin() as admin;

\echo ''
\echo '== 1. the refusals =='
\echo '   expect: PASS 1a (yourself 42501, nobody P0002, hidden P0002), PASS 1b (a paused'
\echo '   member P0002; an account with no member row 42501), PASS 1c (anon may not execute)'
do $$
begin
  begin
    perform public.report_member(auth.uid(), null);
    raise exception 'reported herself';
  exception when insufficient_privilege then raise notice '1a: yourself refused: %', sqlerrm;
  end;
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-0000000000ff', null);
    raise exception 'reported nobody';
  exception when no_data_found then raise notice '1a: nobody refused: %', sqlerrm;
  end;
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000d', null);
    raise exception 'reported a member hidden from Peers';
  exception when no_data_found then raise notice '1a: hidden refused: %', sqlerrm;
  end;
  begin
    perform public.report_member(null, null);
    raise exception 'reported null';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.chat_reports) = 0, 'a refused report left a row';
  raise notice 'PASS 1a';
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000e","role":"authenticated"}', true) is not null as gus;
do $$
begin
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000b', null);
    raise exception 'a paused member reported';
  exception when no_data_found then raise notice '1b: paused refused: %', sqlerrm;
  end;
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-0000000000aa","role":"authenticated"}', true) is not null as stranger;
do $$
begin
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000b', null);
    raise exception 'an account with no member row reported';
  exception when insufficient_privilege then raise notice '1b: no member row refused: %', sqlerrm;
  end;
  raise notice 'PASS 1b';
end;
$$;
do $$
begin
  assert not has_function_privilege('anon', 'public.report_member(uuid,text)', 'execute'), 'anon may report';
  assert has_function_privilege('authenticated', 'public.report_member(uuid,text)', 'execute'), 'members may not report';
  raise notice 'PASS 1c: anon may not execute report_member';
end;
$$;

\echo ''
\echo '== 2. Ada reports Bo: a copy, once, and one column back =='
\echo '   expect: PASS 2a (the copy is the profile now), PASS 2b (twice is one'
\echo '   row), PASS 2c (profile_id is readable; the copy, the photo and the note are not)'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.report_member('7e0f0000-0000-0000-0000-00000000000b', '  Rude in the bio  ');
select public.report_member('7e0f0000-0000-0000-0000-00000000000b', 'again');
do $$
declare
  n integer;
begin
  select count(*) into n from public.chat_reports;
  assert n = 1, format('Ada has %s reports, not one', n);
  assert (select profile_id from public.chat_reports) = '7e0f0000-0000-0000-0000-00000000000b', 'profile_id is wrong';
  raise notice 'PASS 2b: reporting twice is one row';
  begin
    perform profile_snapshot from public.chat_reports;
    raise exception 'Ada read the copy';
  exception when insufficient_privilege then null;
  end;
  begin
    perform profile_photo_path from public.chat_reports;
    raise exception 'Ada read the photograph path';
  exception when insufficient_privilege then null;
  end;
  begin
    perform note from public.chat_reports;
    raise exception 'Ada read the note';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.chat_reports set note = 'x';
    raise exception 'Ada wrote to a report';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 2c: profile_id readable; copy, photograph, note and writes refused';
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
declare
  r record;
begin
  select * into strict r from public.admin_chat_reports() where kind = 'profile';
  assert r.profile_snapshot ->> 'display_name' = 'Bo Report', 'name not copied';
  assert r.profile_snapshot ->> 'username' = 'bo_report', 'username not copied';
  assert r.profile_snapshot ->> 'bio' = 'Bo''s bio, as it was', 'bio not copied';
  assert r.profile_snapshot ->> 'how_injured' = 'Fell, 2009', 'how it happened not copied';
  assert r.profile_snapshot ->> 'detail' = 'Uses a Roho', 'specifics not copied';
  assert r.profile_snapshot ->> 'photo_alt' = 'Bo at a lake', 'photo description not copied';
  assert r.profile_snapshot -> 'interests' = '["Cycling", "Chess"]'::jsonb, 'interests not copied';
  assert r.profile_snapshot -> 'topics' = '["Travel"]'::jsonb, 'topics not copied';
  assert not (r.profile_snapshot ? 'grants'), 'an empty answer was copied';
  assert r.profile_photo_path = '7e0f0000-0000-0000-0000-00000000000b/profile.webp', 'photograph path not kept';
  assert r.note = 'Rude in the bio', 'the note was not trimmed';
  assert r.body_snapshot = '' and r.post_id is null and r.message_id is null, 'a profile report carried a message';
  raise notice 'PASS 2a: % | % | % | %', r.kind, r.context_kind, r.profile_snapshot ->> 'display_name', r.profile_photo_path;
end;
$$;

\echo ''
\echo '== 3. Bo and Cy cannot see it or learn of it =='
\echo '   expect: PASS 3 (no rows, no notification, no admin list)'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
begin
  assert (select count(*) from public.chat_reports) = 0, 'Bo read a report';
  assert (select count(profile_id) from public.chat_reports) = 0, 'Bo read a profile_id';
  assert not exists (select 1 from public.my_notifications(null, 100)), 'Bo was notified';
  begin
    perform public.admin_chat_reports();
    raise exception 'Bo read the administrators'' list';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  assert (select count(*) from public.chat_reports) = 0, 'Cy read a report';
  assert not exists (select 1 from public.my_notifications(null, 100) where kind = 'report'), 'Cy was notified';
  begin
    perform public.admin_chat_reports();
    raise exception 'Cy read the administrators'' list';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 3: the reported member and a bystander see nothing';
end;
$$;

\echo ''
\echo '== 4. Bo edits his profile; the copy does not change =='
\echo '   expect: PASS 4 (his row says Clean Bo; the report still says Bo Report)'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.set_my_username('clean_bo');
update public.members
   set display_name = 'Clean Bo', bio = 'Nothing to see', how_injured = null,
       detail = null, photo_path = null, photo_alt = null, interests = '{}', topics = '{}'
 where id = auth.uid();
do $$
begin
  assert (select display_name from public.members where id = auth.uid()) = 'Clean Bo', 'the edit did not take';
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
declare
  r record;
begin
  select * into strict r from public.admin_chat_reports() where kind = 'profile';
  assert r.profile_snapshot ->> 'display_name' = 'Bo Report', 'the copy follows the edit: name';
  assert r.profile_snapshot ->> 'username' = 'bo_report', 'the copy follows the edit: username';
  assert r.profile_snapshot ->> 'bio' = 'Bo''s bio, as it was', 'the copy follows the edit: bio';
  assert r.profile_snapshot -> 'interests' = '["Cycling", "Chess"]'::jsonb, 'the copy follows the edit: interests';
  assert r.profile_photo_path = '7e0f0000-0000-0000-0000-00000000000b/profile.webp', 'the photograph path went with his';
  assert r.reported_author_name = 'Clean Bo', 'the live name is the current one';
  raise notice 'PASS 4: now "%", reported as "%"', r.reported_author_name, r.profile_snapshot ->> 'display_name';
end;
$$;

\echo ''
\echo '== 5. administrators: labelled, counted, notified, settled =='
\echo '   expect: PASS 5a (a second reporter makes two; already_removed false), PASS 5b'
\echo '   (Ivy has a notification for each report, Ada none; the lock screen goes to'
\echo '   Ivy only and names nobody; Ada cannot settle), PASS 5c (Ivy settles it once)'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
select public.report_member('7e0f0000-0000-0000-0000-00000000000b', null);
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
begin
  assert (select count(*) from public.admin_chat_reports() where kind = 'profile') = 2, 'not two profile reports';
  assert (select min(report_count) from public.admin_chat_reports() where kind = 'profile') = 2, 'not counted as two';
  assert (select count(*) from public.admin_chat_reports() where kind = 'profile' and not already_removed) = 2,
    'a profile report says it is already removed';
  assert (select count(*) from public.admin_chat_reports() where kind = 'block') = 0, 'a profile report is listed as a block';
  raise notice 'PASS 5a: two reporters, report_count 2';
end;
$$;
do $$
begin
  assert (select count(*) from public.my_notifications(null, 100) where kind = 'report') >= 1, 'Ivy was not notified';
  raise notice 'PASS 5b (Ivy): % report notification(s)', (select count(*) from public.my_notifications(null, 100) where kind = 'report');
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
begin
  assert not exists (select 1 from public.my_notifications(null, 100) where kind = 'report'), 'Ada was told of her own report';
  begin
    perform public.admin_resolve_chat_report((select id from public.chat_reports limit 1), 'Looks fine');
    raise exception 'a member settled a report';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 5b (Ada): no notification of her own report; a member cannot settle';
end;
$$;
reset role;
do $$
declare
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret');
  o record;
  n integer := 0;
begin
  for o in select * from public.push_owed(secret, 'report',
    jsonb_build_object('id', (select id from public.chat_reports where reporter_id = '7e0f0000-0000-0000-0000-00000000000a' and kind = 'profile'))) loop
    n := n + 1;
    assert o.endpoint like '%7e0f' || 'f', format('the push went to %s', o.endpoint);
    assert o.actor_name is null and o.body is null and o.subject is null, 'the lock screen said something';
  end loop;
  assert n = 1, format('%s devices owed, not Ivy''s one', n);
  raise notice 'PASS 5b (push): one device, Ivy''s, naming nobody';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
declare
  rid uuid;
begin
  select r.id into strict rid from public.admin_chat_reports() r where r.kind = 'profile' and r.reporter_name = 'Ada Report';
  perform public.admin_resolve_chat_report(rid, 'Spoke to them; changed it');
  perform public.admin_resolve_chat_report(rid, 'A second word');
  assert (select r.resolution from public.admin_chat_reports() r where r.id = rid) = 'Spoke to them; changed it', 'the second settling rewrote it';
  assert (select r.resolved_by_name from public.admin_chat_reports() r where r.id = rid) = 'Ivy Report', 'not settled by Ivy';
  assert (select count(*) from public.admin_chat_reports() where kind = 'profile' and resolved_at is null) = 1, 'not one left open';
  raise notice 'PASS 5c: settled once, by Ivy, with her sentence';
end;
$$;

\echo ''
\echo '== 6. the grants, and the policies that keep the photograph =='
\echo '   expect: PASS 6a (only profile_id of the new columns), PASS 6b (the three photos'
\echo '   policies name photo_is_on_a_report; it is true for the reported path only)'
do $$
begin
  assert has_column_privilege('authenticated', 'public.chat_reports', 'profile_id', 'select'), 'profile_id not granted';
  assert not has_column_privilege('authenticated', 'public.chat_reports', 'profile_snapshot', 'select'), 'copy granted';
  assert not has_column_privilege('authenticated', 'public.chat_reports', 'profile_photo_path', 'select'), 'photograph path granted';
  assert not has_column_privilege('anon', 'public.chat_reports', 'profile_id', 'select'), 'anon granted profile_id';
  raise notice 'PASS 6a';
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
begin
  assert (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('members can replace their own photo', 'members can delete their own photo',
                                'an administrator can delete any photo')
             and (qual like '%photo_is_on_a_report%')) = 3, 'a photos policy does not keep a reported file';
  assert public.photo_is_on_a_report('7e0f0000-0000-0000-0000-00000000000b/profile.webp'), 'the reported photograph is not kept';
  assert not public.photo_is_on_a_report('7e0f0000-0000-0000-0000-00000000000b/other.webp'), 'every photograph is kept';
  assert not has_function_privilege('anon', 'public.photo_is_on_a_report(text)', 'execute'), 'anon may ask';
  raise notice 'PASS 6b: three policies, and only the reported path is kept';
end;
$$;

\echo ''
\echo '== 7. a blocked pair cannot report each other''s profile =='
\echo '   expect: PASS 7 (both directions P0002)'
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.block_member('7e0f0000-0000-0000-0000-00000000000c');
do $$
begin
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000c', null);
    raise exception 'the blocker reported the blocked';
  exception when no_data_found then null;
  end;
end;
$$;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000a', null);
    raise exception 'the blocked reported the blocker';
  exception when no_data_found then null;
  end;
  raise notice 'PASS 7: refused both ways';
end;
$$;

\echo ''
\echo '== 8. Bo deletes his account: each copy forgets who he was and keeps the words =='
\echo '   expect: PASS 8a (both copies read Deleted member, with no @username, photograph'
\echo '   description or photograph path, and nobody linked), PASS 8b (bio, interests,'
\echo '   note, dates and status as before), PASS 8c (his photograph is no longer kept),'
\echo '   PASS 8d (reporting him now is P0002)'
-- Hal and Jo, reported by Ada, are for steps 9 and 10.
reset role;
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin,
   username, bio, how_injured, detail, photo_path, photo_alt, interests, topics)
values
('7e0f0000-0000-0000-0000-000000000010','peer','active','Hal Report','19990220007','1980-01-01','T1–T6','CA',true,false,
 'hal_report','Hal''s bio','Diving, 2015',null,'7e0f0000-0000-0000-0000-000000000010/p1.webp',
 'Hal on a pier','{Sailing}','{}'),
('7e0f0000-0000-0000-0000-000000000011','peer','active','Jo Report','19990220008','1980-01-01','T1–T6','CA',true,false,
 'jo_report','Jo''s bio',null,null,'7e0f0000-0000-0000-0000-000000000011/p1.webp',
 'Jo smiling','{Chess}','{}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.report_member('7e0f0000-0000-0000-0000-000000000010', 'Hal''s photo');
select public.report_member('7e0f0000-0000-0000-0000-000000000011', 'Jo''s bio');
-- What must not change, read before: Bo's reports without the three things
-- that go, and every report that is not about Bo or Hal.
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
select set_config('probe.bo_kept', (
  select string_agg(concat_ws('|', r.id, r.note, r.created_at, r.written_at, r.resolved_at,
                              r.resolution, r.resolved_by, r.reporter_id, r.place,
                              r.profile_snapshot - 'display_name' - 'username' - 'photo_alt'), ';' order by r.id)
    from public.admin_chat_reports() r
   where r.reported_author_id = '7e0f0000-0000-0000-0000-00000000000b'), true) is not null as bo_kept;
select set_config('probe.others', (
  select md5(string_agg(row_to_json(r)::text, ';' order by r.id))
    from public.admin_chat_reports() r
   where r.reported_author_id is distinct from '7e0f0000-0000-0000-0000-00000000000b'
     and r.reported_author_id is distinct from '7e0f0000-0000-0000-0000-000000000010'), true) is not null as others;
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.delete_my_account();
select set_config('request.jwt.claims','{"sub":"7e0f0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
declare
  r record;
  n integer := 0;
begin
  for r in select * from public.admin_chat_reports() where kind = 'profile' and reported_author_id is null loop
    n := n + 1;
    assert r.profile_snapshot ->> 'display_name' = 'Deleted member', format('the copy says %s', r.profile_snapshot ->> 'display_name');
    assert not (r.profile_snapshot ? 'username'), 'the @username stayed';
    assert not (r.profile_snapshot ? 'photo_alt'), 'the photograph description stayed';
    assert r.profile_photo_path is null, 'the photograph path stayed';
    assert r.reported_author_name is null, 'somebody is named';
    assert r.profile_snapshot::text not like '%Bo Report%' and r.profile_snapshot::text not like '%Clean Bo%'
       and r.profile_snapshot::text not like '%bo_report%' and r.profile_snapshot::text not like '%clean_bo%'
       and r.profile_snapshot::text not like '%lake%', 'a name, @username or description is still in the copy';
  end loop;
  assert n = 2, format('%s copies about a deleted member, not Ada''s and Cy''s', n);
  raise notice 'PASS 8a: both copies read Deleted member, with no @username or photograph';
end;
$$;
do $$
begin
  assert (select string_agg(concat_ws('|', r.id, r.note, r.created_at, r.written_at, r.resolved_at,
                                      r.resolution, r.resolved_by, r.reporter_id, r.place,
                                      r.profile_snapshot - 'display_name' - 'username' - 'photo_alt'), ';' order by r.id)
            from public.admin_chat_reports() r
           where r.kind = 'profile' and r.reported_author_id is null) = current_setting('probe.bo_kept'),
    'the words, note, dates or status changed';
  assert (select count(*) from public.admin_chat_reports()
           where kind = 'profile' and reported_author_id is null
             and profile_snapshot ->> 'bio' = 'Bo''s bio, as it was'
             and profile_snapshot ->> 'how_injured' = 'Fell, 2009'
             and profile_snapshot -> 'interests' = '["Cycling", "Chess"]'::jsonb
             and note = 'Rude in the bio' and resolution = 'Spoke to them; changed it'
             and resolved_by_name = 'Ivy Report' and reporter_name = 'Ada Report') = 1,
    'Ada''s report lost its words, note or status';
  assert (select count(*) from public.admin_chat_reports()
           where kind = 'profile' and reported_author_id is null
             and profile_snapshot ->> 'bio' = 'Nothing to see' and resolved_at is null
             and reporter_name = 'Cy Report') = 1,
    'Cy''s report lost its words or status';
  raise notice 'PASS 8b: words, note, dates and status kept (% chars compared)', length(current_setting('probe.bo_kept'));
end;
$$;
do $$
begin
  assert not public.photo_is_on_a_report('7e0f0000-0000-0000-0000-00000000000b/profile.webp'),
    'the deleted member''s photograph is still kept';
  raise notice 'PASS 8c: his photograph is no longer named, so it can be deleted';
end;
$$;
do $$
begin
  begin
    perform public.report_member('7e0f0000-0000-0000-0000-00000000000b', null);
    raise exception 'reported a deleted member';
  exception when no_data_found then null;
  end;
  raise notice 'PASS 8d: a deleted member cannot be reported';
end;
$$;

\echo ''
\echo '== 9. Ivy removes Hal: his copy forgets him the same way =='
\echo '   expect: PASS 9a (Deleted member, no @username, description or path; his bio,'
\echo '   interests and Ada''s note kept), PASS 9b (his photograph is no longer kept)'
do $$
begin
  assert public.photo_is_on_a_report('7e0f0000-0000-0000-0000-000000000010/p1.webp'), 'Hal''s photograph was never kept';
end;
$$;
select public.admin_delete_member('7e0f0000-0000-0000-0000-000000000010');
do $$
declare
  r record;
begin
  select * into strict r from public.admin_chat_reports() where note = 'Hal''s photo';
  assert r.profile_snapshot ->> 'display_name' = 'Deleted member', 'Hal''s copy keeps his name';
  assert not (r.profile_snapshot ? 'username') and not (r.profile_snapshot ? 'photo_alt'), 'Hal''s copy keeps his @username or description';
  assert r.profile_photo_path is null and r.reported_author_id is null, 'Hal''s copy keeps his photograph or a link';
  assert r.profile_snapshot ->> 'bio' = 'Hal''s bio' and r.profile_snapshot ->> 'how_injured' = 'Diving, 2015'
     and r.profile_snapshot -> 'interests' = '["Sailing"]'::jsonb, 'Hal''s words went';
  assert r.reporter_name = 'Ada Report' and r.resolved_at is null, 'the report itself changed';
  raise notice 'PASS 9a: % | bio "%"', r.profile_snapshot ->> 'display_name', r.profile_snapshot ->> 'bio';
  assert not public.photo_is_on_a_report('7e0f0000-0000-0000-0000-000000000010/p1.webp'), 'Hal''s photograph is still kept';
  raise notice 'PASS 9b: his photograph is no longer named';
end;
$$;

\echo ''
\echo '== 10. everybody else''s reports are untouched =='
\echo '   expect: PASS 10a (Jo''s copy names her, with her photograph, still kept),'
\echo '   PASS 10b (every report not about Bo or Hal is byte for byte as before),'
\echo '   PASS 10c (the trigger is there and nobody can call its function)'
do $$
declare
  r record;
begin
  select * into strict r from public.admin_chat_reports() where note = 'Jo''s bio';
  assert r.profile_snapshot ->> 'display_name' = 'Jo Report' and r.profile_snapshot ->> 'username' = 'jo_report'
     and r.profile_snapshot ->> 'photo_alt' = 'Jo smiling', 'Jo''s copy changed';
  assert r.profile_photo_path = '7e0f0000-0000-0000-0000-000000000011/p1.webp', 'Jo''s photograph path went';
  assert public.photo_is_on_a_report('7e0f0000-0000-0000-0000-000000000011/p1.webp'), 'Jo''s photograph is no longer kept';
  raise notice 'PASS 10a: % @% | %', r.profile_snapshot ->> 'display_name', r.profile_snapshot ->> 'username', r.profile_photo_path;
  assert (select md5(string_agg(row_to_json(o)::text, ';' order by o.id))
            from public.admin_chat_reports() o
           where o.reported_author_id is not null) = current_setting('probe.others'),
    'a report about somebody else changed';
  raise notice 'PASS 10b: % other report(s) as before',
    (select count(*) from public.admin_chat_reports() where reported_author_id is not null);
  assert exists (select 1 from pg_trigger where tgname = 'members_forget_in_reports'
                   and tgrelid = 'public.members'::regclass and not tgisinternal), 'no trigger';
  assert not has_function_privilege('authenticated', 'private.forget_a_deleted_member_in_reports()', 'execute'), 'members may call it';
  assert not has_function_privilege('anon', 'private.forget_a_deleted_member_in_reports()', 'execute'), 'anon may call it';
  raise notice 'PASS 10c: before delete on members; not callable';
end;
$$;

rollback;
\echo ''
\echo '== rolled back =='
