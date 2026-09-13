-- ============================================================================
-- Claiming a profile now actually carries it across
-- ============================================================================
-- Reported after a successful claim: the member came out with a name, a
-- level, a city and nothing else. No photograph, no bio, none of the
-- interests, topics, self-care or affiliations that made the directory entry
-- worth claiming — and the seeded row that held them was gone.
--
-- ---------------------------------------------------------------------------
-- Where it went
-- ---------------------------------------------------------------------------
-- 20260910130000 describes claiming as "pre-filling onboarding": both paths
-- insert an ordinary row through the ordinary policy, and the only difference
-- is whether the fields arrive populated. That was the right design and it
-- was only ever half-built. The client pre-fills five fields — display name,
-- exact level, completeness, city, state — because those are the five the
-- wizard asks for. Everything else on the seeded row had nowhere to go, and
-- this trigger deleted it on the way past.
--
-- Nothing failed. The insert succeeded, the profile was simply emptier than
-- the directory entry it replaced, which is the opposite of what claiming is
-- for.
--
-- ---------------------------------------------------------------------------
-- Why the copy belongs here rather than in the client
-- ---------------------------------------------------------------------------
-- The obvious fix is to have `my_claimable_profile()` return everything and
-- the client write it back. That would hand the whole profile — including a
-- bio describing catheters and bowel programmes — to somebody who is not yet
-- a member and, on a mistyped invite, is not the person on the card either.
-- 20260913020000 kept that function to ten columns on purpose.
--
-- Doing it here keeps the data server-side from start to finish. The person
-- never receives the profile; they receive a row that already is one.
--
-- ---------------------------------------------------------------------------
-- Their answers win
-- ---------------------------------------------------------------------------
-- Every field is copied only where the incoming row has nothing to say: null,
-- or an empty array. Somebody who claimed the profile and then corrected
-- their city keeps the correction. Somebody who skipped the rest of
-- onboarding gets the directory's answers, which is the whole point of
-- claiming.
--
-- Two pairs move together or not at all:
--
--   * `injury_date` and `injury_date_precision`, because
--     members_injury_date_precision_paired requires both or neither.
--   * `exact_level` and `level_range`, and only when the incoming row says
--     'Not sure yet' with no exact level. Otherwise a seeded C7 could end up
--     sitting under a range the person had just chosen for themselves.
--
-- `type` is deliberately NOT carried. Several seeded rows are mentors, and a
-- mentor can put two numbers on the club's list — so inheriting it by
-- claiming would make a mistyped invite an invite-rights grant. An
-- administrator promoting somebody afterwards is one click and leaves a
-- decision behind; the failure mode is somebody having less than they should,
-- which is visible and fixable, rather than more.
-- ============================================================================

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

    if found then
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

  return new;
end;
$$;
