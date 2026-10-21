-- ============================================================================
-- Who viewed a post, for administrators (20261022030000)
-- ============================================================================
-- public.admin_post_viewers(post), and the device each view was on, written
-- by the new chat_mark_posts_seen(ids, device) and
-- chat_mark_topic_read_through(topic, post, device):
--
--   1. a member and anon cannot ask; a member cannot read the devices
--   2. viewers are everyone the count counts, never the author, with the
--      views from before devices were recorded (no device, perhaps no time)
--   3. a device is mobile or desktop, recorded once each, never the author's
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-post-viewers.sql
--
-- One transaction, rolled back; each expected refusal in its own block.
-- Every check raises if it fails and prints PASS if it holds.
-- ============================================================================
\set ON_ERROR_STOP on
begin;

-- Wren wrote the post. Abe read the topic before devices existed; Bea saw it
-- on Home on a phone; Cal opened it on a computer, then saw it on a phone;
-- Dot only liked it. Ivy is the administrator and never viewed it.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
('aaaaaaaa-2203-0000-0000-000000000001','peer','active','Wren Probe','19990220301','1980-01-01','T1–T6','CA',true,false),
('aaaaaaaa-2203-0000-0000-000000000002','peer','active','Abe Probe','19990220302','1980-01-01','T1–T6','CA',true,false),
('aaaaaaaa-2203-0000-0000-000000000003','peer','active','Bea Probe','19990220303','1980-01-01','T1–T6','CA',true,false),
('aaaaaaaa-2203-0000-0000-000000000004','peer','active','Cal Probe','19990220304','1980-01-01','T1–T6','CA',true,false),
('aaaaaaaa-2203-0000-0000-000000000005','peer','active','Dot Probe','19990220305','1980-01-01','T1–T6','CA',true,false),
('aaaaaaaa-2203-0000-0000-000000000006','peer','active','Ivy Probe','19990220306','1980-01-01','T1–T6','CA',true,true);
update public.chat_rooms set opened_at = now() where id = 'bowel';
insert into public.chat_topics (id, room_id, title, author_id) values
('22030000-0000-0000-0000-000000000001','bowel','Viewers probe','aaaaaaaa-2203-0000-0000-000000000001');
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
('22030000-0000-0000-0000-000000000011','22030000-0000-0000-0000-000000000001','aaaaaaaa-2203-0000-0000-000000000001','The opener','2026-01-01'),
('22030000-0000-0000-0000-000000000012','22030000-0000-0000-0000-000000000001','aaaaaaaa-2203-0000-0000-000000000001','A later reply','2026-01-03');
-- Abe's read, written before any device was: through the opener only.
insert into public.chat_topic_reads (topic_id, member_id, last_read_at) values
('22030000-0000-0000-0000-000000000001','aaaaaaaa-2203-0000-0000-000000000002','2026-01-01');

set local role authenticated;

-- Bea, on a phone, on Home.
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000003","role":"authenticated"}';
select public.chat_mark_posts_seen(array['22030000-0000-0000-0000-000000000011'::uuid], 'mobile');
select public.chat_mark_posts_seen(array['22030000-0000-0000-0000-000000000011'::uuid], 'mobile');

-- Cal, on a computer in the room, then a phone on Home.
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000004","role":"authenticated"}';
select public.chat_mark_topic_read_through('22030000-0000-0000-0000-000000000001','22030000-0000-0000-0000-000000000012','desktop');
select public.chat_mark_posts_seen(array['22030000-0000-0000-0000-000000000011'::uuid], 'mobile');

-- Dot likes it from Home without it being recorded as seen.
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000005","role":"authenticated"}';
insert into public.chat_post_likes (post_id, member_id) values ('22030000-0000-0000-0000-000000000011', auth.uid());

-- Wren sees her own post on both devices: nothing is recorded.
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000001","role":"authenticated"}';
select public.chat_mark_posts_seen(array['22030000-0000-0000-0000-000000000011'::uuid], 'mobile');
select public.chat_mark_topic_read_through('22030000-0000-0000-0000-000000000001','22030000-0000-0000-0000-000000000012','desktop');

-- 1. Refusals, as Bea (a member, not an administrator).
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.admin_post_viewers('22030000-0000-0000-0000-000000000011');
    raise exception 'a member read who viewed a post';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chat_post_view_devices;
    raise exception 'a member read the devices';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_mark_posts_seen(array['22030000-0000-0000-0000-000000000011'::uuid], 'tablet');
    raise exception 'a device that is neither was accepted';
  exception when invalid_parameter_value then null;
  end;
  assert not has_function_privilege('anon', 'public.admin_post_viewers(uuid)', 'execute'), 'anon may ask who viewed';
  assert not has_function_privilege('anon', 'public.chat_mark_posts_seen(uuid[],text)', 'execute'), 'anon may mark seen';
  assert not has_function_privilege('anon', 'public.chat_mark_topic_read_through(uuid,uuid,text)', 'execute'), 'anon may mark read';
  raise notice 'PASS 1: a member and anon cannot ask, nor read devices; a device is mobile or desktop';
end;
$$;

-- 2 and 3, as Ivy (the administrator).
set local request.jwt.claims='{"sub":"aaaaaaaa-2203-0000-0000-000000000006","role":"authenticated"}';
do $$
declare
  names text;
  bea text[];
  cal text[];
  abe record;
begin
  select string_agg(display_name, ', ' order by display_name) into names
    from public.admin_post_viewers('22030000-0000-0000-0000-000000000011');
  assert names = 'Abe Probe, Bea Probe, Cal Probe, Dot Probe', format('viewers were %s', names);
  assert (select count(*) from public.admin_post_viewers('22030000-0000-0000-0000-000000000011'))
       = (select view_count from public.chat_post_view_counts(array['22030000-0000-0000-0000-000000000011'::uuid])),
    'the list and the count disagree';

  select * into abe from public.admin_post_viewers('22030000-0000-0000-0000-000000000011')
    where display_name = 'Abe Probe';
  assert abe.devices = '{}' and abe.seen_at is null, 'a read from before devices claimed a device or a time';
  assert (select devices from public.admin_post_viewers('22030000-0000-0000-0000-000000000011')
          where display_name = 'Dot Probe') = '{}', 'a like alone claimed a device';
  assert (select seen_at from public.admin_post_viewers('22030000-0000-0000-0000-000000000011')
          where display_name = 'Dot Probe') is not null, 'a like lost its time';

  select devices into bea from public.admin_post_viewers('22030000-0000-0000-0000-000000000011')
    where display_name = 'Bea Probe';
  select devices into cal from public.admin_post_viewers('22030000-0000-0000-0000-000000000011')
    where display_name = 'Cal Probe';
  assert bea = '{mobile}', format('Bea was %s', bea);
  assert cal = '{desktop,mobile}', format('Cal was %s', cal);
  raise notice 'PASS 2: everyone the count counts, never the author, old views without a device';

  -- The later reply: Abe read only through the opener, so he is not on it;
  -- Cal read through it on a computer.
  select string_agg(display_name || ':' || array_to_string(devices, '+'), ', ' order by display_name) into names
    from public.admin_post_viewers('22030000-0000-0000-0000-000000000012');
  assert names = 'Cal Probe:desktop', format('the reply''s viewers were %s', names);
  raise notice 'PASS 3: a room read records its device on every post read through, once';
end;
$$;

-- Nothing was recorded for the author, and Bea's repeat added nothing.
reset role;
do $$
begin
  assert (select count(*) from public.chat_post_view_devices
          where member_id = 'aaaaaaaa-2203-0000-0000-000000000001') = 0, 'the author''s device was recorded';
  assert (select count(*) from public.chat_post_view_devices
          where member_id = 'aaaaaaaa-2203-0000-0000-000000000003') = 1, 'a repeat view added a row';
  raise notice 'PASS 4: never the author''s device; one row a device';
end;
$$;
rollback;
