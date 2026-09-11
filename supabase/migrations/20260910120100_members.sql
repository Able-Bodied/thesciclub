-- ============================================================================
-- members — one row per person in the club
-- ============================================================================
-- Vocabulary (docs/CONTEXT.md): everybody here is a *member*. `type` says
-- whether a member is also a mentor. There is no separate mentors table and no
-- "peer" as an identity.
--
-- Two columns never leave the server: `phone` (sign-in identity) and
-- `birth_date` (exists for the age gate; every screen reads a derived age).
-- RLS below is own-row-only for *all* operations, so a direct
-- `select * from members` can never return somebody else's row no matter what
-- the client asks for. The one projection through which one member sees
-- another is the `browse_members` view, which does not select those two
-- columns at all.
--
-- Injury is recorded as level + completeness + a *date*, not as a disability
-- type and not as a duration bucket. A stored year count is wrong within
-- twelve months and needs something to roll it forward; a date is simply
-- correct forever. See docs/CONTEXT.md, "How injury is recorded".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Why `id` does not reference auth.users
-- ---------------------------------------------------------------------------
-- The club is seeded with the NorCal SCI mentor directory, and those people do
-- not have accounts yet. A foreign key to auth.users would mean either
-- hand-inserting rows into Supabase's own auth schema — fragile across GoTrue
-- upgrades — or keeping the seed in a second table that nothing else can
-- reference, which would leave seeded members unable to appear on an event
-- RSVP or anywhere else that points at a member.
--
-- So `id` is a plain uuid. For a real member it is `auth.uid()`, enforced by
-- every policy on this table. For a seeded member it is derived from the
-- person's name and belongs to no account, which means every policy here
-- (`auth.uid() = id`) rejects writes to those rows for every caller: the
-- seeded population is readable through browse_members and writable by nobody.
--
-- The cascade that the foreign key used to provide is replaced by the trigger
-- on auth.users at the bottom of this file.
create table if not exists public.members (
  id uuid primary key,

  type text not null default 'peer' check (type in ('peer', 'mentor')),
  -- Membership can be lost. `suspended` is reversible, `removed` is not; both
  -- drop the member out of browse_members.
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),

  display_name text not null check (length(trim(display_name)) > 0),

  -- Never selected by browse_members. Digits only, E.164 without the '+', which
  -- is the shape Supabase auth stores and the shape normalize_phone() produces.
  phone text not null unique,
  birth_date date not null,

  -- ---------------------------------------------------------------- injury
  -- Onboarding asks the coarse range (one tap, answerable from a hospital bed).
  -- The profile survey refines it to an exact level later, for anyone who wants
  -- to give one.
  level_range text not null
    check (level_range in ('C1–C4', 'C5–C8', 'T1–T6', 'T7–T12', 'L1–S5', 'Not sure yet')),
  exact_level text
    check (exact_level is null or exact_level in (
      'C1','C2','C3','C4','C5','C6','C7','C8',
      'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12',
      'L1','L2','L3','L4','L5','S1','S2','S3','S4','S5',
      -- Injuries between two segments. People describe themselves this way and
      -- the NorCal SCI directory records four of them.
      'C4/5','C5/6','C6/7','T11/12',
      'Do not know')),
  completeness text not null default 'Do not know'
    check (completeness in ('Complete', 'Incomplete', 'Do not know')),

  injury_date date,
  -- Nothing displays more precision than was given. Year-only is a normal
  -- answer to "when were you injured", not a skip.
  injury_date_precision text
    check (injury_date_precision is null or injury_date_precision in ('day', 'month', 'year')),
  -- Both set, or neither. A precision without a date means nothing, and a date
  -- without a precision would get rendered at a confidence nobody claimed.
  constraint members_injury_date_precision_paired check (
    (injury_date is null) = (injury_date_precision is null)
  ),

  -- Derived, never hand-set: a filter and a profile must not be able to
  -- disagree about which region somebody is in. Mirrors regionForRange() in
  -- src/types/domain.ts.
  region text generated always as (
    case
      when level_range in ('C1–C4', 'C5–C8') then 'Cervical'
      when level_range in ('T1–T6', 'T7–T12') then 'Thoracic'
      when level_range = 'L1–S5' then 'Lumbar & sacral'
      else 'Unknown'
    end
  ) stored,

  how_injured text,

  -- ------------------------------------------------------------- location
  -- Nullable: "Somewhere else" is a real answer on the location step, and not
  -- everybody wants to name a town. State is the coarsest thing we always want.
  city text,
  state text not null,

  -- --------------------------------------------------------------- photos
  photo_url text,
  photo_alt text,
  -- Fallback tile colour when there is no photo. Never required.
  avatar_color text,

  -- ----------------------------------------------------------- life & kit
  bio text,
  detail text,
  gender text,
  languages text[] not null default '{}',
  -- Five, not the survey's four. The NorCal SCI directory records "Mostly
  -- independent", which is a distinction people actually draw about themselves,
  -- and flattening it into "Partially independent" would be us editing somebody's
  -- description of their own life to fit our enum.
  independence text
    check (independence is null or independence in (
      'Completely independent','Mostly independent','Partially independent',
      'Partially dependent','Completely dependent')),
  -- 'Seeking work' is separate from 'Not currently working' because the
  -- directory draws that line and it is a meaningful one — somebody working with
  -- vocational rehab is in a different place from somebody who is not looking.
  employment text
    check (employment is null or employment in (
      'Full time','Part time','Student','Retired','Seeking work',
      'Not currently working')),
  field_of_work text,
  education text,
  education_when text check (education_when is null or education_when in ('Before','After','Both')),
  marital_status text,
  has_children boolean,
  children_when text check (children_when is null or children_when in ('Before','After','Both')),

  -- Three, so the ones chosen actually mean something.
  interests text[] not null default '{}'
    check (coalesce(array_length(interests, 1), 0) <= 3),
  -- "Ask me about" — the single field members search on most.
  topics text[] not null default '{}',
  -- Devices and procedures somebody is willing to discuss.
  self_care text[] not null default '{}',

  affiliations text[] not null default '{}',
  wants_to_mentor boolean not null default false,

  -- Each member's own opt-out from being browsable. Honoured by browse_members.
  show_in_browse boolean not null default true,

  -- True for rows seeded from the NorCal SCI mentor directory rather than
  -- entered by the member. Anything absent from that directory is left null
  -- rather than invented: these are real people, and a plausible-looking
  -- injury date we made up would be indistinguishable from one they gave us.
  is_seed boolean not null default false,

  -- Which invite let this member in. FK added by the invites migration, which
  -- runs after this one.
  invite_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_browse_idx
  on public.members (status, show_in_browse, type);
create index if not exists members_region_idx on public.members (region);
create index if not exists members_city_idx on public.members (city);

-- --------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------- RLS
alter table public.members enable row level security;

drop policy if exists "members can select own row" on public.members;
create policy "members can select own row"
  on public.members for select
  using (auth.uid() = id);

drop policy if exists "members can update own row" on public.members;
create policy "members can update own row"
  on public.members for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "members can delete own row" on public.members;
create policy "members can delete own row"
  on public.members for delete
  using (auth.uid() = id);

-- The insert policy is added by the invites migration: it has to check the
-- invite list, and that table does not exist yet. Until then there is no
-- insert policy at all, which fails closed.

-- ------------------------------------------------------------- photo bucket
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view photos" on storage.objects;
create policy "anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "members can upload their own photo" on storage.objects;
create policy "members can upload their own photo"
  on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members can replace their own photo" on storage.objects;
create policy "members can replace their own photo"
  on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members can delete their own photo" on storage.objects;
create policy "members can delete their own photo"
  on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------ auth deletion, without a FK
-- Replaces the `on delete cascade` that the dropped auth.users foreign key used
-- to give us. Deleting an account deletes the member row that belonged to it;
-- seeded rows have no account and are untouched.
create or replace function public.delete_member_for_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.members where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.delete_member_for_deleted_user();
