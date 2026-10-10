-- ============================================================================
-- Adaptive sports equipment and grants
-- ============================================================================
-- The owner, 2026-10-08: two questions on the profile survey, both answered in
-- the member's own words.
--
--   "Do you own any adaptive sports equipment?"   sports_equipment
--   "Did you receive any grants?"                 grants
--
-- Free text rather than yes/no and a list. Both were drafted as choices first
-- and changed by the owner before this was ever applied, because the useful
-- part is the specifics another member asks about: "Top End Force 3
-- handcycle, Freewheel, and HOC Glide ski"; "a Kelly Brush grant and High
-- Fives grant for my handcycle and a NorCal SCI Franklin Project rehab grant
-- to go to Neuroworx". Which grant paid for what, and for which piece of
-- equipment, does not fit in a list of organizations.
--
-- Nullable, no default: null is "not answered yet", which is every member
-- today. The member writes these through the same row update as every other
-- survey answer; nothing here is protected (guard_own_member_row judges only
-- status, type, phone, is_seed and invite_id). Deleting an account deletes the
-- row, so they go with it.
--
-- Not added to browse_members. Who received which grant is new information
-- about a person, and whether other members see it is the owner's call; until
-- then both are on the member's own answers page and nowhere else.
--
-- 1000 characters each, the limit `detail` has. src/lib/member-limits.ts
-- states the same numbers for the boxes, and its test reads them from here.

alter table public.members
  add column if not exists sports_equipment text,
  add column if not exists grants text;

comment on column public.members.sports_equipment is
  'Profile survey: the adaptive sports equipment a member owns, in their words. Null until answered.';
comment on column public.members.grants is
  'Profile survey: grants the member has received, in their words. Null until answered.';

alter table public.members
  drop constraint if exists members_sports_equipment_length,
  drop constraint if exists members_grants_length;
alter table public.members
  add constraint members_sports_equipment_length check (char_length(sports_equipment) <= 1000),
  add constraint members_grants_length check (char_length(grants) <= 1000);
