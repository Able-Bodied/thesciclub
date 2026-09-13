-- ============================================================================
-- event_rsvps / event_dismissals — Interested, Going, and Not interested
-- ============================================================================
-- This is where the port diverges most from ab-peers, and the reason is that
-- ab-peers had no accounts.
--
-- Its RSVP table keyed on a `viewer_id`: a random string the client minted
-- into localStorage the first time it needed one. That identified a browser,
-- not a person, so there was nothing an RLS policy could usefully check and
-- every policy it wrote was `using (true)` — anyone holding the public anon
-- key could read, rewrite or delete anybody's RSVPs. Its own header called
-- that out and left a TODO for when auth landed.
--
-- Auth has landed. An RSVP here is a member, so `member_id` references
-- `members` and every policy is own-row-only, the same posture the members
-- table itself has.
--
-- ---------------------------------------------------------------------------
-- The line this table has to sit on
-- ---------------------------------------------------------------------------
-- Events are public; members are not (CONTEXT.md, "What is public"). An
-- RSVP is both at once — it is a fact about an event *and* a fact about a
-- person — and specifically it is a statement that a named individual has a
-- spinal cord injury and will be at a known place at a known time. That is the
-- single most sensitive row in this schema.
--
-- So the table itself is readable only by the member whose row it is, and the
-- two things the UI actually needs are served by two views with different
-- audiences:
--
--   event_rsvp_counts  — "3 going · 5 interested". An aggregate with no
--                        identity in it, readable by anyone, because the
--                        public event page shows it.
--
--   event_attendees    — who is going, for the overlapping avatars on the card
--                        and the Going list on the detail page. Readable only
--                        by an active member, and only of members who have not
--                        opted out of being browsed.
--
-- Both are security definer for the same reason browse_members is: with
-- invoker semantics the own-row-only RLS underneath would reduce every count
-- to the viewer's own RSVP and every attendee list to the viewer themselves.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- event_rsvps
-- ---------------------------------------------------------------------------
create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  -- Interested and Going are one column, not two booleans: the mock's card
  -- shows them as a pair of buttons where picking one clears the other, and
  -- "interested and also going" is not a state anybody means.
  status text not null check (status in ('interested', 'going')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per member per event. Changing your mind is an update; taking it
  -- back is a delete.
  unique (event_id, member_id)
);

create index if not exists event_rsvps_event_id_idx on public.event_rsvps (event_id);
-- The "I'm going" segment reads every RSVP of one member.
create index if not exists event_rsvps_member_id_idx on public.event_rsvps (member_id, status);

drop trigger if exists event_rsvps_touch_updated_at on public.event_rsvps;
create trigger event_rsvps_touch_updated_at
  before update on public.event_rsvps
  for each row execute function public.touch_updated_at();

alter table public.event_rsvps enable row level security;

-- Every policy below carries the same two conditions: the row is yours, and
-- you are still in the club. The second is not redundant — a suspended member
-- keeps their session until it expires, and should not be able to add
-- themselves to a roster in the meantime.
drop policy if exists "members read own rsvps" on public.event_rsvps;
create policy "members read own rsvps"
  on public.event_rsvps for select
  using (member_id = auth.uid());

drop policy if exists "members create own rsvps" on public.event_rsvps;
create policy "members create own rsvps"
  on public.event_rsvps for insert
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
  );

drop policy if exists "members change own rsvps" on public.event_rsvps;
create policy "members change own rsvps"
  on public.event_rsvps for update
  using (member_id = auth.uid())
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
  );

-- Deliberately not gated on active membership: somebody who has been suspended
-- should still be able to take their name off a roster.
drop policy if exists "members remove own rsvps" on public.event_rsvps;
create policy "members remove own rsvps"
  on public.event_rsvps for delete
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_dismissals — "Not interested", the ✕ on the card
-- ---------------------------------------------------------------------------
-- A personal list and nothing else. Unlike event_rsvps there is no aggregate
-- and no roster to reconcile, so there is no status column either: the row's
-- existence is the whole fact, and undoing it is a delete rather than an
-- update. Nobody but the member ever reads it, so it needs no view.
create table if not exists public.event_dismissals (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- "which events has this member hidden", asked once per feed load.
create index if not exists event_dismissals_member_id_idx on public.event_dismissals (member_id);

alter table public.event_dismissals enable row level security;

drop policy if exists "members read own dismissals" on public.event_dismissals;
create policy "members read own dismissals"
  on public.event_dismissals for select
  using (member_id = auth.uid());

drop policy if exists "members create own dismissals" on public.event_dismissals;
create policy "members create own dismissals"
  on public.event_dismissals for insert
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
  );

drop policy if exists "members remove own dismissals" on public.event_dismissals;
create policy "members remove own dismissals"
  on public.event_dismissals for delete
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_rsvp_counts — the public tally
-- ---------------------------------------------------------------------------
-- Counts every RSVP, including members who have opted out of being browsed:
-- this says how many people are coming, and opting out of a directory is not
-- opting out of being counted. It carries no member_id, so it cannot say which
-- ones.
--
-- Events with no RSVPs are absent rather than present with a zero — the list
-- left-joins this and reads a missing row as zero, which costs one branch and
-- saves a row per event in the common case.
drop view if exists public.event_rsvp_counts;

create view public.event_rsvp_counts as
select
  event_id,
  count(*) filter (where status = 'going')::int as going_count,
  count(*) filter (where status = 'interested')::int as interested_count
from public.event_rsvps
group by event_id;

grant select on public.event_rsvp_counts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- event_attendees — who is going, for members only
-- ---------------------------------------------------------------------------
-- Joins through browse_members rather than members, which buys three things at
-- once and is the reason it is written this way: browse_members already
-- refuses to return anything unless the *viewer* is an active member, it
-- already honours each member's show_in_browse opt-out, and it already excludes
-- phone and birth_date. Reaching into `members` directly here would mean
-- re-implementing all three, and a second implementation is a second thing to
-- get wrong.
--
-- A member who is hidden from the deck is therefore counted by
-- event_rsvp_counts but does not appear here. That asymmetry is intended: they
-- said "do not show me to other members", not "do not count me".
drop view if exists public.event_attendees;

create view public.event_attendees as
select
  r.event_id,
  r.status,
  r.created_at as rsvp_created_at,
  m.id as member_id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.level_range,
  m.exact_level,
  m.type
from public.event_rsvps r
join public.browse_members m on m.id = r.member_id;

-- Not granted to anon at all, and revoked rather than merely left ungranted:
-- this is the object where an inherited grant would republish the club's
-- membership against a calendar.
revoke all on public.event_attendees from anon;
revoke all on public.event_attendees from public;
grant select on public.event_attendees to authenticated;
