-- Undo for 20261118190000_a_ranking_for_home_and_rooms_and_an_alert_at_minus_three.sql.
-- Puts back 20261118180000's score, boost and room ranking, and
-- 20261022130000's admin_chat_reports. Reports raised by votes stay, as
-- reports with no reporter; dropping the column loses only that they were.

drop trigger if exists chat_post_downvotes_report_at_minus_three on public.chat_post_downvotes;
drop function if exists private.chat_report_voted_down();
drop function if exists public.home_topics_ranked(integer);
-- Then run, from 20261118180000: chat_post_score, chat_post_scores,
-- admin_boost_post and chat_topics_ranked; and from 20261022130000:
-- admin_chat_reports (drop it first). After those:
-- drop function if exists private.chat_topic_rank(uuid, uuid);
-- drop function if exists private.chat_post_boost(uuid);
-- alter table public.chat_reports drop column if exists raised_by_votes;
