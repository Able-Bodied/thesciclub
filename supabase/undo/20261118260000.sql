-- Undo for 20261118260000_home_reads_its_posts_in_one_request.sql.
-- A website that asks for home_feed and is refused reads Home as before, with
-- the ranking and then the posts, so this can be run under a live website.

drop function if exists public.home_feed(text, text, integer);
