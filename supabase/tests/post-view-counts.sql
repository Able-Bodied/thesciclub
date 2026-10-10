-- Run locally with psql as in chat-post-likes.sql. Rolls back every fixture.
-- Counts are tested as an ordinary signed-in member, with older/newer posts,
-- repeated visits, removed posts, a closed room and private reader identities.
\set ON_ERROR_STOP on
begin;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
('aaaaaaaa-8888-0000-0000-000000000001','peer','active','Count writer','19990008001','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-8888-0000-0000-000000000002','peer','active','Count reader','19990008002','1980-01-01','T1–T6','CA',true);
update public.chat_rooms set opened_at = now() where id in ('bowel','bladder');
insert into public.chat_topics (id,room_id,title,author_id) values
('80000000-0000-0000-0000-000000000001','bowel','Count probe','aaaaaaaa-8888-0000-0000-000000000001'),
('80000000-0000-0000-0000-000000000002','bladder','Closed probe','aaaaaaaa-8888-0000-0000-000000000001');
insert into public.chat_topics (id,room_id,title,author_id) values
('80000000-0000-0000-0000-000000000003','bowel','Removed opener','aaaaaaaa-8888-0000-0000-000000000001');
insert into public.chat_posts (id,topic_id,author_id,body,created_at) values
('80000000-0000-0000-0000-000000000011','80000000-0000-0000-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Before visit','2026-01-01'),
('80000000-0000-0000-0000-000000000012','80000000-0000-0000-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','After visit','2026-01-03'),
('80000000-0000-0000-0000-000000000013','80000000-0000-0000-0000-000000000002','aaaaaaaa-8888-0000-0000-000000000001','Closed post','2026-01-01'),
('80000000-0000-0000-0000-000000000014','80000000-0000-0000-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Removed','2026-01-01');
update public.chat_posts set removed_at=now() where id='80000000-0000-0000-0000-000000000014';
insert into public.chat_posts (id,topic_id,author_id,body,created_at) values
('80000000-0000-0000-0000-000000000015','80000000-0000-0000-0000-000000000003','aaaaaaaa-8888-0000-0000-000000000001','Removed opener','2026-01-01'),
('80000000-0000-0000-0000-000000000016','80000000-0000-0000-0000-000000000003','aaaaaaaa-8888-0000-0000-000000000002','Reply stays','2026-01-03');
update public.chat_posts set removed_at=now() where id='80000000-0000-0000-0000-000000000015';
insert into public.chat_topic_reads (topic_id,member_id,last_read_at) values
('80000000-0000-0000-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000002','2026-01-02'),
('80000000-0000-0000-0000-000000000002','aaaaaaaa-8888-0000-0000-000000000002','2026-01-02');
update public.chat_rooms set opened_at=null where id='bladder';
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
do $$
declare old_count bigint; new_count bigint; rows_seen bigint;
begin
  assert (select post_id from public.chat_topic_opening_posts(array['80000000-0000-0000-0000-000000000001'::uuid]))='80000000-0000-0000-0000-000000000011'::uuid, 'wrong opening post';
  assert (select post_id from public.chat_topic_opening_posts(array['80000000-0000-0000-0000-000000000003'::uuid])) is null, 'a reply replaced a removed opener';
  assert (select count(*) from public.chat_topic_opening_posts(array['80000000-0000-0000-0000-000000000002'::uuid]))=0, 'closed opener leaked';
  select count(*) into rows_seen from public.chat_post_view_counts(array[
    '80000000-0000-0000-0000-000000000011'::uuid,
    '80000000-0000-0000-0000-000000000012'::uuid,
    '80000000-0000-0000-0000-000000000013'::uuid,
    '80000000-0000-0000-0000-000000000014'::uuid]);
  assert rows_seen=2, 'closed and removed post counts leaked';
  select view_count into old_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]);
  select view_count into new_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000012'::uuid]);
  assert old_count=1 and new_count=0, 'a later reply counted an earlier visit';
  assert (select count(*) from public.chat_topic_reads)=0, 'private reader identities leaked';
  perform public.chat_mark_topic_read_through('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000012');
  perform public.chat_mark_topic_read_through('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000012');
  select view_count into old_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]);
  select view_count into new_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000012'::uuid]);
  assert old_count=2 and new_count=1, 'repeat visit inflated distinct readers';
  insert into public.chat_post_likes (post_id,member_id) values ('80000000-0000-0000-0000-000000000012','aaaaaaaa-8888-0000-0000-000000000001');
  assert (select count(*) from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012')=1, 'self-like not saved';
  delete from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012' and member_id=auth.uid();
  assert (select count(*) from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012')=0, 'self-like not removed';
  assert not has_function_privilege('anon','public.chat_post_view_counts(uuid[])','execute'), 'anonymous counts granted';
  raise notice 'PASS: visibility, delivered boundary, private readers, repeat visit, self-like, unlike, anonymous refusal';
end;
$$;
rollback;
