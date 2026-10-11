-- ============================================================================
-- @username in chat lists
-- ============================================================================
-- Session 5 of EMAIL-SIGN-IN-PLAN.md. Conversation lists, the group member list
-- and the people pickers name a person by display name alone, and two people
-- can share one. `chat_authors` is every member as an author; it gains the
-- @name, appended last so the columns before it keep their place and type.
--
-- `create or replace` keeps the grants 20261003020000 set (select to
-- authenticated only), so nothing is re-granted here.
-- ============================================================================

create or replace view public.chat_authors as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  (m.show_in_browse and m.status = 'active') as has_profile,
  m.username::text as username
from public.members m
where public.is_member();
