-- Undo for 20261118180000_votes_up_and_down_and_an_admin_boost.sql. Likes are
-- untouched by it. Dropping the two tables loses every downvote and boost.

drop function if exists public.chat_topics_ranked(text, integer, integer);
drop function if exists public.admin_boost_post(uuid, boolean);
drop function if exists public.chat_post_scores(uuid[]);
drop function if exists private.chat_post_score(uuid);
drop trigger if exists chat_post_likes_one_way on public.chat_post_likes;
drop trigger if exists chat_post_downvotes_one_way on public.chat_post_downvotes;
drop function if exists private.chat_vote_one_way();
drop table if exists public.chat_post_boosts;
drop table if exists public.chat_post_downvotes;
