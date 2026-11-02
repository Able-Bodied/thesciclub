-- Up to ten interests rather than three (the owner, 2026-11-01): they are to help
-- rank peers and organizations, and with the list now grouped, three said little
-- about somebody who likes things in more than one of its groups.
alter table public.members
  drop constraint members_interests_check,
  add constraint members_interests_check
    check (coalesce(array_length(interests, 1), 0) <= 10);
