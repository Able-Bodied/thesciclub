-- Chat bylines colour the level by how long ago, as cards do (the owner,
-- 2026-11-17: "keep the color coding in the chats and messages? Just a
-- highlight around the level"). The stage only, never the date
-- (20261117030000). Added at the end, so an older app reads the view as before.

-- As 20261022060000, with injury_stage at the end.
create or replace view public.chat_authors with (security_barrier = true) as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  (m.show_in_browse and m.status = 'active' and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  )) as has_profile,
  m.username::text as username,
  m.injury_type,
  m.condition_name,
  public.injury_stage(m.injury_date) as injury_stage
from public.members m
where public.is_member();
