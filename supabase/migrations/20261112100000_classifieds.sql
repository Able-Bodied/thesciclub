-- ============================================================================
-- Classifieds: a category of its own, with three rooms in it
-- ============================================================================
-- The owner, 2026-11-12: a classifieds section in Chat with three rooms.
--   For sale     things members are selling
--   Giving away  surplus supplies and equipment, free: the catheters you
--                ended up not using
--   Looking for  things members need
--
-- Opened now and started by nobody, like the seeded rooms. Listings are
-- ordinary topics; nothing about posting changes.
--
-- Members cannot start a room in Classifieds: chat_create_room keeps its own
-- list from 20261010030000, which does not name it, and refuses it with the
-- sentence it already has. Only the column's check grows (expand, never
-- drop): a copy of the app from before this draws an unknown category's
-- rooms under Body rather than failing, so old iPhone copies see the three
-- rooms too, under the wrong heading.
--
-- `on conflict do nothing` covers an id or a name already taken, as in
-- 20261010030000: a member's own room already called "For sale" is left as it
-- is, and this one is then not made.
-- ============================================================================

alter table public.chat_rooms drop constraint if exists chat_rooms_category_check;
alter table public.chat_rooms
  add constraint chat_rooms_category_check
  check (category in (
    'General', 'Body', 'Mind', 'Life', 'Family', 'Kit', 'Places', 'Classifieds', 'Other'
  ));

comment on column public.chat_rooms.category is
  'One of General, Body, Mind, Life, Family, Kit, Places, Classifieds or Other. Chosen by whoever starts the room; nobody changes it afterwards. Members cannot start a room in Classifieds.';

-- No glyphs: the plain letter tile is the safe choice (see 20261010030000).
insert into public.chat_rooms (id, name, description, category, icon, sort_order, opened_at)
values
  (
    'for-sale',
    'For sale',
    'Equipment and other things members are selling. Say what it is, its condition, the price and roughly where you are.',
    'Classifieds',
    null,
    20,
    now()
  ),
  (
    'giving-away',
    'Giving away',
    'Free to whoever can use it: surplus supplies like catheters you ended up not using, and equipment you no longer need.',
    'Classifieds',
    null,
    21,
    now()
  ),
  (
    'looking-for',
    'Looking for',
    'Something you need, to buy, borrow or be given. Say what it is and roughly where you are.',
    'Classifieds',
    null,
    22,
    now()
  )
on conflict do nothing;
