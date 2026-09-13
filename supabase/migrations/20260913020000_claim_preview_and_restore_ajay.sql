-- ============================================================================
-- The claim never appeared, because the lookup ran against a view the person
-- signing up cannot read
-- ============================================================================
-- Reported from the hosted project: an invite was created against a seeded
-- profile, the number signed up, and onboarding went straight to "what is your
-- name" without ever asking "is this you?". The seeded profile then vanished
-- from Peers.
--
-- Both halves of that are one bug and one working-as-intended.
--
-- ---------------------------------------------------------------------------
-- Why the prompt never showed
-- ---------------------------------------------------------------------------
-- `my_invite_status()` correctly returns `claimable_member_id`. Onboarding
-- then read the profile itself out of `public.browse_members` — and
-- 20260911110000_browse_requires_membership.sql had since added, correctly:
--
--     and exists (select 1 from public.members viewer
--                 where viewer.id = auth.uid() and viewer.status = 'active')
--
-- The person part-way through onboarding is not a member yet, by definition.
-- So the view returned no rows, the client's `if (profile)` was false, and it
-- fell through to the name step. No error, nothing in the console: the one
-- shape of failure this project keeps finding.
--
-- That security fix was right and stays. What was wrong is asking a
-- members-only view a question on behalf of somebody who is not a member.
--
-- ---------------------------------------------------------------------------
-- Why the seeded profile disappeared anyway
-- ---------------------------------------------------------------------------
-- Working as intended, and worth saying so. `consume_invite_for_new_member`
-- retires the seeded row whenever the consumed invite carried a claim, whether
-- or not the person took the data across — see its comment. Declining a claim
-- still means that person now has a real row, and leaving the seeded one
-- behind is the duplicate the whole mechanism exists to avoid.
--
-- The unhappy version of that is what happened here: the claim was never
-- offered, so the row was retired in exchange for nothing. The fix above stops
-- it; the restore below undoes this instance.
--
-- ---------------------------------------------------------------------------
-- What the new function gives away, and to whom
-- ---------------------------------------------------------------------------
-- Ten columns, not the profile. A claim card asks "is this you?" and shows a
-- photograph, a name, a level and a city; it has no business showing the bio,
-- which on these rows describes catheters and bowel programmes, to somebody
-- who has not yet joined and might turn out to be the wrong person on a
-- mistyped number.
--
-- No argument, like `my_invite_status`: the phone comes from the verified JWT
-- and the seeded row is reached through the caller's own invite, so a caller
-- can only ever see the one profile their invite points at.
-- ============================================================================

create or replace function public.my_claimable_profile()
returns table (
  id uuid,
  display_name text,
  photo_path text,
  photo_alt text,
  city text,
  state text,
  level_range text,
  exact_level text,
  completeness text,
  affiliations text[]
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.display_name,
    m.photo_path,
    m.photo_alt,
    m.city,
    m.state,
    m.level_range,
    m.exact_level,
    m.completeness,
    m.affiliations
  from (select public.normalize_phone(auth.jwt() ->> 'phone') as phone) me
  join public.invites i
    on i.phone = me.phone
   and i.status in ('pending', 'consumed')
  join public.members m
    on m.id = i.seed_member_id
   -- Only a seeded row is claimable. Without this, an invite pointing at a
   -- real member's id would hand their name and photograph to whoever holds
   -- the number — the same guard the retirement trigger puts on its delete.
   and m.is_seed
  limit 1;
$$;

revoke all on function public.my_claimable_profile() from public, anon;
grant execute on function public.my_claimable_profile() to authenticated;

-- ------------------------------------------------------------ the restore
-- Ajay's seeded row, retired by the bug above on the hosted project. Guarded
-- twice so this is inert everywhere it should be: on a local stack, where the
-- seed migration already inserted him, and on any database where somebody has
-- since joined on that number. Data repair rather than schema, which is why
-- it names exactly one row and cannot touch another.
insert into public.members (
  id, type, display_name, phone, birth_date, level_range, exact_level, completeness,
  city, state, photo_path, detail, languages, independence, employment, field_of_work,
  education, interests, topics, self_care, affiliations, wants_to_mentor, is_seed
)
select
  'c85c10bf-0226-394f-8c91-2a2ffc40a147', 'peer', 'Ajay', '15555550000', '1996-01-01',
  'C5–C8', 'C7', 'Incomplete', 'San Jose', 'CA',
  'https://images.squarespace-cdn.com/content/v1/639f51bcb6f2d126acbc35ab/76946e11-5bef-4527-999b-9691cf49e418/Ajay.jpg?format=500w',
  'Manual chair. Strong upper body, weaker left tricep/lat/chest, impaired hand function (stronger grip right hand). Global spasticity used for hand function, transfers, and walking short distances with spotters. Lives alone.',
  array['English']::text[], 'Completely independent', 'Student', 'Nutrition (in grad school)',
  'In progress — grad school for nutrition',
  array['Water sports', 'Fitness & exercise', 'Cooking']::text[],
  array['Adaptive sports', 'Back to school', 'Suprapubic catheter', 'UTIs', 'Getting into dating']::text[],
  array['Suprapubic catheter', 'Wheelchair assist devices']::text[],
  array['NorCal SCI']::text[], false, true
where not exists (
  select 1 from public.members
  where id = 'c85c10bf-0226-394f-8c91-2a2ffc40a147' or phone = '15555550000'
);
