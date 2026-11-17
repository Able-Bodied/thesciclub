-- A post in a room can be 100,000 characters, not 4,000.
--
-- The owner, 2026-11-17: starting a room for members to share their life
-- story, the first post stopped at 4,000 characters. "Why is there a limit to
-- posts? Can you remove that limit?"
--
-- The 4,000 was the chat message's number, given to posts on their first day
-- (20260918040000) and never asked for. A post is not a message: it is the
-- place for something long. What stays is a ceiling no typist reaches, about
-- 17,000 words, so that a script cannot store a book in every post: a post's
-- words are read whole by the room, by Home and by Realtime.
--
-- A message in a conversation keeps its 4,000 (chat_messages_check).
--
-- Only loosened, so the shipped iPhone builds, which still stop the box at
-- 4,000, go on working and read a longer post like any other.

alter table public.chat_posts drop constraint if exists chat_posts_check;
alter table public.chat_posts add constraint chat_posts_check check (
  char_length(body) <= 100000
  and (removed_at is not null or char_length(btrim(body)) > 0 or cardinality(attachments) > 0)
);

-- A report keeps its own copy of the post, whole (20260918150000), and that
-- copy had the same 4,000: reporting a longer post would have been refused.
alter table public.chat_reports drop constraint if exists chat_reports_body_snapshot_check;
alter table public.chat_reports add constraint chat_reports_body_snapshot_check check (
  char_length(body_snapshot) <= 100000
);
