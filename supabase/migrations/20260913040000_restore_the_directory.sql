-- ============================================================================
-- A snapshot of the seeded directory, and a way to put it back
-- ============================================================================
-- Claiming a seeded profile retires it, by design: the trigger deletes the
-- seeded row whether or not the person carried its data across, because
-- declining still means they now have a real row and leaving the seeded one
-- behind is the duplicate the mechanism exists to prevent.
--
-- Which is correct, and makes the claim flow untestable more than once. Every
-- rehearsal costs a member of the directory, and putting one back has so far
-- meant a hand-written migration naming that person's 30-odd columns —
-- 20260913020000 did exactly that for Ajay, and got his photograph wrong
-- because it copied a value the schema had since renamed.
--
-- ---------------------------------------------------------------------------
-- Why a snapshot table rather than a script or a seed file
-- ---------------------------------------------------------------------------
-- The directory is real data about 23 real people, and it already exists in
-- `members`. Copying it into a JSON file in the repo, or into a second SQL
-- INSERT, would be two sources that drift — and the one that drifts silently
-- is the one nobody looks at until they need it. This copies the rows from
-- the table itself, at migration time, so the snapshot is by construction
-- what the directory actually was.
--
-- It also means the restore cannot invent anybody: it can only put back a row
-- that was there when this ran.
--
-- ---------------------------------------------------------------------------
-- What restoring does, and what it refuses to touch
-- ---------------------------------------------------------------------------
-- Missing rows are re-inserted; seeded rows that are still there are reset to
-- the snapshot, which is what makes it useful after a rehearsal that
-- suspended or edited one. Two things it will not do:
--
--   * It never touches a row that is not `is_seed`. A real member who happens
--     to share an id with the snapshot is not overwritten — they claimed that
--     profile, and their row is theirs now.
--   * It skips a snapshot row whose phone belongs to somebody real. That is
--     the claim having been completed: the person is in the club under that
--     number, and re-inserting the directory entry would put a second copy of
--     them in the deck.
--
-- So the honest summary is "restore the directory to how it shipped, without
-- disturbing anybody who has since joined".
-- ============================================================================

-- Ajay again. The claim flow was rehearsed against him after 20260913020000
-- put him back, which retired him a second time — correctly. This is the last
-- time it needs doing by hand.
insert into public.members (
  id, type, display_name, phone, birth_date, level_range, exact_level, completeness,
  city, state, photo_path, detail, languages, independence, employment, field_of_work,
  education, interests, topics, self_care, affiliations, wants_to_mentor, is_seed
)
select
  'c85c10bf-0226-394f-8c91-2a2ffc40a147', 'peer', 'Ajay', '15555550000', '1996-01-01',
  'C5–C8', 'C7', 'Incomplete', 'San Jose', 'CA',
  'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp',
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

-- ----------------------------------------------------------------- snapshot
create table if not exists public.directory_seed as
select
  m.id, m.type, m.status, m.display_name, m.phone, m.birth_date, m.level_range,
  m.exact_level, m.completeness, m.injury_date, m.injury_date_precision, m.how_injured,
  m.city, m.state, m.photo_path, m.photo_alt, m.avatar_color, m.bio, m.detail, m.gender,
  m.languages, m.independence, m.employment, m.field_of_work, m.education,
  m.education_when, m.marital_status, m.has_children, m.children_when, m.interests,
  m.topics, m.self_care, m.affiliations, m.wants_to_mentor, m.show_in_browse, m.is_seed
from public.members m
where m.is_seed;

alter table public.directory_seed add primary key (id);

comment on table public.directory_seed is
  'How the seeded NorCal SCI directory shipped. Read by admin_restore_directory(); never written to by the app.';

alter table public.directory_seed enable row level security;
-- No policy: the only reader is the SECURITY DEFINER function below.

-- ------------------------------------------------------------------ restore
create or replace function public.admin_restore_directory()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touched integer;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  insert into public.members (
    id, type, status, display_name, phone, birth_date, level_range, exact_level,
    completeness, injury_date, injury_date_precision, how_injured, city, state, photo_path,
    photo_alt, avatar_color, bio, detail, gender, languages, independence, employment,
    field_of_work, education, education_when, marital_status, has_children, children_when,
    interests, topics, self_care, affiliations, wants_to_mentor, show_in_browse, is_seed
  )
  select
    d.id, d.type, d.status, d.display_name, d.phone, d.birth_date, d.level_range,
    d.exact_level, d.completeness, d.injury_date, d.injury_date_precision, d.how_injured,
    d.city, d.state, d.photo_path, d.photo_alt, d.avatar_color, d.bio, d.detail, d.gender,
    d.languages, d.independence, d.employment, d.field_of_work, d.education,
    d.education_when, d.marital_status, d.has_children, d.children_when, d.interests,
    d.topics, d.self_care, d.affiliations, d.wants_to_mentor, d.show_in_browse, d.is_seed
  from public.directory_seed d
  where not exists (
    -- Somebody real is on that number: the claim went through, and they are
    -- the directory entry now.
    select 1 from public.members m where m.phone = d.phone and not m.is_seed
  )
  on conflict (id) do update set
  type = excluded.type, status = excluded.status, display_name = excluded.display_name,
  phone = excluded.phone, birth_date = excluded.birth_date,
  level_range = excluded.level_range, exact_level = excluded.exact_level,
  completeness = excluded.completeness, injury_date = excluded.injury_date,
  injury_date_precision = excluded.injury_date_precision,
  how_injured = excluded.how_injured, city = excluded.city, state = excluded.state,
  photo_path = excluded.photo_path, photo_alt = excluded.photo_alt,
  avatar_color = excluded.avatar_color, bio = excluded.bio, detail = excluded.detail,
  gender = excluded.gender, languages = excluded.languages,
  independence = excluded.independence, employment = excluded.employment,
  field_of_work = excluded.field_of_work, education = excluded.education,
  education_when = excluded.education_when, marital_status = excluded.marital_status,
  has_children = excluded.has_children, children_when = excluded.children_when,
  interests = excluded.interests, topics = excluded.topics, self_care = excluded.self_care,
  affiliations = excluded.affiliations, wants_to_mentor = excluded.wants_to_mentor,
  show_in_browse = excluded.show_in_browse, is_seed = excluded.is_seed
  -- Never a real member's row, however it came to share this id.
  where public.members.is_seed;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.admin_restore_directory() from public, anon;
grant execute on function public.admin_restore_directory() to authenticated;
