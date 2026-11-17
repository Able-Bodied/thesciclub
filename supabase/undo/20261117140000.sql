-- Undo for 20261117140000_a_post_is_as_long_as_its_story.sql. Refused while
-- any post, or any report's copy of one, is longer than 4,000 characters:
-- shorten or remove those first, or leave the ceiling where it is.
alter table public.chat_reports drop constraint if exists chat_reports_body_snapshot_check;
alter table public.chat_reports add constraint chat_reports_body_snapshot_check check (
  char_length(body_snapshot) <= 4000
);
alter table public.chat_posts drop constraint if exists chat_posts_check;
alter table public.chat_posts add constraint chat_posts_check check (
  char_length(body) <= 4000
  and (removed_at is not null or char_length(btrim(body)) > 0 or cardinality(attachments) > 0)
);
