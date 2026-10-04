-- ============================================================================
-- What a member writes about themselves has a length the database enforces
-- ============================================================================
-- "members can update own row" lets a member write any of these columns with
-- their own session, and until now the only limits were the forms' (and most
-- forms had none). Found 2026-10-03 by a security checklist: anybody with dev
-- tools could save a megabyte as their bio, and every member who opens the
-- deck downloads it.
--
-- Each limit is several times what the form needs and what anybody has
-- written. On 2026-10-03 the longest values in members and directory_seed
-- were: bio 308, field_of_work 66, education 60, how_injured 27, display_name
-- 14, city 13; topics 9 items and 201 characters in all. The forms carry the
-- same numbers as maxLength (src/lib/member-limits.ts), so nobody types past
-- one and meets a refusal instead.
--
-- The lists are bounded in count and in total characters, not per item: a
-- check constraint cannot look inside an array without a function, and what
-- this guards against is size.
-- ============================================================================

alter table public.members
  add constraint members_display_name_length check (char_length(display_name) <= 60),
  add constraint members_city_length check (char_length(city) <= 100),
  add constraint members_state_length check (char_length(state) <= 60),
  add constraint members_how_injured_length check (char_length(how_injured) <= 1000),
  add constraint members_bio_length check (char_length(bio) <= 2000),
  add constraint members_detail_length check (char_length(detail) <= 1000),
  add constraint members_field_of_work_length check (char_length(field_of_work) <= 200),
  add constraint members_photo_alt_length check (char_length(photo_alt) <= 200),
  add constraint members_photo_path_length check (char_length(photo_path) <= 200),
  add constraint members_avatar_color_length check (char_length(avatar_color) <= 32),
  add constraint members_gender_length check (char_length(gender) <= 100),
  add constraint members_education_length check (char_length(education) <= 100),
  add constraint members_marital_status_length check (char_length(marital_status) <= 100),
  add constraint members_languages_size check (
    cardinality(languages) <= 40 and char_length(array_to_string(languages, '')) <= 4000
  ),
  add constraint members_topics_size check (
    cardinality(topics) <= 40 and char_length(array_to_string(topics, '')) <= 4000
  ),
  add constraint members_self_care_size check (
    cardinality(self_care) <= 40 and char_length(array_to_string(self_care, '')) <= 4000
  ),
  add constraint members_affiliations_size check (
    cardinality(affiliations) <= 40 and char_length(array_to_string(affiliations, '')) <= 4000
  ),
  add constraint members_declined_size check (cardinality(declined) <= 40);
