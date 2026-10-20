-- Run locally with psql as in chat-post-likes.sql. Rolls back every fixture.
-- Counts are tested as an ordinary signed-in member, with older/newer posts,
-- repeated visits, removed posts, a closed room and private reader identities.
-- The author's own visit is never a view (20261016020000); another member's is,
-- and so is any visit to a deleted member's post.
-- A like or a reaction is a view, once per member, never the author's
-- (20261019000000).
\set ON_ERROR_STOP on
begin;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
('aaaaaaaa-8888-0000-0000-000000000001','peer','active','Count writer','19990008001','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-8888-0000-0000-000000000002','peer','active','Count reader','19990008002','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-8888-0000-0000-000000000003','peer','active','Count liker','19990008003','1980-01-01','T1–T6','CA',true);
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
  assert old_count=1 and new_count=0, 'the author''s own visit counted';
  assert (select view_count from public.chat_topics_for('bowel')
           where id = '80000000-0000-0000-0000-000000000001')=1, 'the author''s own visit counted on the topic';
  insert into public.chat_post_likes (post_id,member_id) values ('80000000-0000-0000-0000-000000000012','aaaaaaaa-8888-0000-0000-000000000001');
  assert (select count(*) from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012')=1, 'self-like not saved';
  delete from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012' and member_id=auth.uid();
  assert (select count(*) from public.chat_post_likes where post_id='80000000-0000-0000-0000-000000000012')=0, 'self-like not removed';
  assert not has_function_privilege('anon','public.chat_post_view_counts(uuid[])','execute'), 'anonymous counts granted';
  raise notice 'PASS: visibility, delivered boundary, private readers, own visit, self-like, unlike, anonymous refusal';
end;
$$;

-- The reader comes back for the newer post: that is a view, once.
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000002","role":"authenticated"}';
do $$
declare old_count bigint; new_count bigint;
begin
  perform public.chat_mark_topic_read_through('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000012');
  perform public.chat_mark_topic_read_through('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000012');
  select view_count into old_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]);
  select view_count into new_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000012'::uuid]);
  assert old_count=1 and new_count=1, 'another member''s visit did not count, or a repeat inflated it';
  raise notice 'PASS: another member''s visit counts once';
end;
$$;

-- The author's own like and reaction are not views.
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  insert into public.chat_post_likes (post_id,member_id) values ('80000000-0000-0000-0000-000000000011',auth.uid());
  perform public.chat_set_reaction('post','80000000-0000-0000-0000-000000000011','❤️');
  assert (select view_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]))=1,
    'the author''s like or reaction counted';
  assert (select view_count from public.chat_topics_for('bowel')
           where id = '80000000-0000-0000-0000-000000000001')=1, 'the author''s like counted on the topic';
  raise notice 'PASS: the author''s like and reaction are not views';
end;
$$;

-- A member who never opened the topic likes and reacts from Home: one view.
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  assert not public.chat_topic_viewed_by_me('80000000-0000-0000-0000-000000000001'), 'seen before anything';
  insert into public.chat_post_likes (post_id,member_id) values ('80000000-0000-0000-0000-000000000016',auth.uid());
  insert into public.chat_post_likes (post_id,member_id) values ('80000000-0000-0000-0000-000000000012',auth.uid());
  perform public.chat_set_reaction('post','80000000-0000-0000-0000-000000000012','❤️');
  assert public.chat_topic_viewed_by_me('80000000-0000-0000-0000-000000000001'), 'a like was not seen';
  assert (select view_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000012'::uuid]))=2,
    'a like and a reaction were not one view';
  assert (select view_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]))=1,
    'a like on one post counted on another';
  perform public.chat_set_reaction('post','80000000-0000-0000-0000-000000000011','🙏');
  assert (select view_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000011'::uuid]))=2,
    'a reaction alone was not a view';
  assert (select view_count from public.chat_topics_for('bowel')
           where id = '80000000-0000-0000-0000-000000000001')=2, 'the liker was not one view on the topic';
  raise notice 'PASS: a like or reaction is one view, on the post and the topic';
end;
$$;

-- Somebody else's likes do not make a topic "viewed by me".
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  assert public.chat_topic_viewed_by_me('80000000-0000-0000-0000-000000000001'), 'a read was not seen';
  assert not public.chat_topic_viewed_by_me('80000000-0000-0000-0000-000000000003'), 'another member''s like was mine';
  assert not has_function_privilege('anon','public.chat_topic_viewed_by_me(uuid)','execute'), 'anonymous viewed check granted';
  raise notice 'PASS: viewed-by-me is the caller''s own';
end;
$$;

-- A deleted member's post: nobody is its author, so every reader counts.
reset role;
update public.chat_posts set author_id = null where id = '80000000-0000-0000-0000-000000000012';
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  assert (select view_count from public.chat_post_view_counts(array['80000000-0000-0000-0000-000000000012'::uuid]))=3,
    'a deleted member''s post lost a reader';
  raise notice 'PASS: a deleted member''s post counts every reader';
end;
$$;
rollback;
