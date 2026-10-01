-- ============================================================================
-- "Start fresh" on a claim carries nothing across
-- ============================================================================
-- Onboarding offers somebody whose invite names a seeded profile two
-- buttons: "Yes, that's me" and "Start fresh", and under the second it says
-- "Starting fresh removes the old profile too." It did remove it — and first
-- copied its photograph, bio, interests, topics, self-care, affiliations,
-- injury date and the rest into the new row, because
-- consume_invite_for_new_member() (20260913050000) copies whenever the invite
-- names a seed. The insert never said which button was pressed, so the
-- trigger could not tell. Found in Home step 6, 2026-10-01.
--
-- On a mistyped invite this is the case that matters: the person on the card
-- is not the person signing up, says so, and is handed that stranger's face
-- and bio anyway.
--
-- ---------------------------------------------------------------------------
-- How the insert says it
-- ---------------------------------------------------------------------------
-- A column, `start_fresh`, that the client sets on the insert and the
-- trigger reads. Nothing else can carry the choice: the invite is not the
-- client's to write, and the claim is consumed in the same statement as the
-- insert, so there is no earlier moment to record it.
--
-- It is an instruction, not a fact, so it is never stored. The trigger reads
-- it and sets it back to false, and a check constraint holds it there — so a
-- row cannot later claim to have started fresh, and an update cannot set it.
-- Check constraints are tested after BEFORE triggers, which is what lets the
-- insert carry true and the row keep false.
--
-- ---------------------------------------------------------------------------
-- What does not change
-- ---------------------------------------------------------------------------
-- * The seeded row is still retired either way. Declining still means the
--   person now has a real row, and leaving the seed behind is the duplicate
--   claiming exists to prevent.
-- * The invite is still consumed and attached.
-- * The default is false, so a client that predates this column — an
--   installed app not yet updated — inserts without it and gets exactly the
--   old behaviour. This migration goes before the client that sends it.
-- ============================================================================

alter table public.members
  add column start_fresh boolean not null default false;

alter table public.members
  add constraint members_start_fresh_not_stored check (start_fresh = false);

comment on column public.members.start_fresh is
  'Set true on the onboarding insert when somebody declines a claimed seeded profile; read and cleared by consume_invite_for_new_member(). Never stored true.';

create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_id uuid;
  claimed_id uuid;
  seed public.members%rowtype;
begin
  update public.invites
     set status = 'consumed', consumed_at = now()
   where phone = new.phone
     and status = 'pending'
  returning id, seed_member_id into matched_id, claimed_id;

  new.invite_id := coalesce(new.invite_id, matched_id);

  if claimed_id is not null then
    select * into seed from public.members where id = claimed_id and is_seed;

    -- "Start fresh": the seed is retired below all the same, and nothing of
    -- it is carried.
    if found and not new.start_fresh then
      -- Only where the incoming row has nothing to say. `coalesce` does that
      -- for the nullable scalars; the arrays need the empty case spelled out,
      -- since '{}' is not null.
      new.photo_path      := coalesce(new.photo_path, seed.photo_path);
      new.photo_alt       := coalesce(new.photo_alt, seed.photo_alt);
      new.avatar_color    := coalesce(new.avatar_color, seed.avatar_color);
      new.bio             := coalesce(new.bio, seed.bio);
      new.detail          := coalesce(new.detail, seed.detail);
      new.how_injured     := coalesce(new.how_injured, seed.how_injured);
      new.gender          := coalesce(new.gender, seed.gender);
      new.city            := coalesce(new.city, seed.city);
      new.state           := coalesce(new.state, seed.state);
      new.independence    := coalesce(new.independence, seed.independence);
      new.employment      := coalesce(new.employment, seed.employment);
      new.field_of_work   := coalesce(new.field_of_work, seed.field_of_work);
      new.education       := coalesce(new.education, seed.education);
      new.education_when  := coalesce(new.education_when, seed.education_when);
      new.marital_status  := coalesce(new.marital_status, seed.marital_status);
      new.has_children    := coalesce(new.has_children, seed.has_children);
      new.children_when   := coalesce(new.children_when, seed.children_when);
      new.wants_to_mentor := coalesce(new.wants_to_mentor, seed.wants_to_mentor);

      if coalesce(array_length(new.languages, 1), 0) = 0 then
        new.languages := seed.languages;
      end if;
      if coalesce(array_length(new.interests, 1), 0) = 0 then
        new.interests := seed.interests;
      end if;
      if coalesce(array_length(new.topics, 1), 0) = 0 then
        new.topics := seed.topics;
      end if;
      if coalesce(array_length(new.self_care, 1), 0) = 0 then
        new.self_care := seed.self_care;
      end if;
      if coalesce(array_length(new.affiliations, 1), 0) = 0 then
        new.affiliations := seed.affiliations;
      end if;

      -- Paired by members_injury_date_precision_paired.
      if new.injury_date is null then
        new.injury_date           := seed.injury_date;
        new.injury_date_precision := seed.injury_date_precision;
      end if;

      -- Only when the person has not placed themselves, so a carried exact
      -- level can never contradict a range they chose.
      if new.exact_level is null and new.level_range = 'Not sure yet' then
        new.exact_level := seed.exact_level;
        new.level_range := seed.level_range;
      end if;
    end if;

    -- Retire the seeded profile, whether or not the member chose to carry its
    -- data across. Declining a claim still means that person now has a real
    -- row, and leaving the seeded one behind would be the duplicate we are
    -- avoiding.
    --
    -- RLS on this insert is evaluated after this trigger, so a refused insert
    -- rolls the deletion back with it.
    delete from public.members where id = claimed_id and is_seed;
  end if;

  -- An instruction to this trigger, not a fact about the member: never
  -- stored. members_start_fresh_not_stored holds it to false afterwards.
  new.start_fresh := false;

  return new;
end;
$$;
