-- Undo for 20261104212000_a_topic_reads_alone_and_a_room_lists_forty.sql.
-- The app falls back to chat_topics_for when these are missing.

drop function if exists public.chat_topics_page(text, integer, timestamptz, uuid);
drop function if exists public.chat_topic_for(uuid);
