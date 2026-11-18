-- Undo for 20261118170000_a_room_counts_questions_replies_views_and_its_last_activity.sql:
-- the view as 20260927030000 left it, with its option (20261003030000) and
-- grants (20261003020000, 20261020000000). A view cannot lose columns by
-- "create or replace", so it is dropped first. Put back a website from before
-- 20261118170000 first: this one reads the four columns that go.
drop view if exists public.chat_room_stats;

create view public.chat_room_stats with (security_barrier = true) as
select
  r.id as room_id,
  (select count(*) from public.chat_topics t where t.room_id = r.id) as topic_count,
  (
    select count(*)
    from public.chat_posts p
    join public.chat_topics t on t.id = p.topic_id
    where t.room_id = r.id and p.removed_at is null
  ) as post_count,
  (select count(*) from public.chat_room_members m where m.room_id = r.id) as member_count
from public.chat_rooms r
where public.chat_room_is_readable(r.id);

revoke all on public.chat_room_stats from public, anon, authenticated;
grant select on public.chat_room_stats to authenticated;
grant select, insert, update, delete on public.chat_room_stats to service_role;
