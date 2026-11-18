-- Undo for 20261118230000_home_shows_mine_my_replies_and_my_organizations.sql.
-- Put back a website from before it first: this one asks the function for
-- every choice of Show and Sort but the default.
drop function if exists public.home_topics_shown(text, text, integer);
