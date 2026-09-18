-- Following an organization.
--
-- Asked for by the owner: every member, peer or mentor, can follow the bodies
-- they care about. 23 organizations are in the directory and 5 of them run
-- anything; a member who turns up to NorCal SCI's things and nothing else has
-- had no way to say so, and the Events tab has had no way to know.
--
-- ---------------------------------------------------------------------------
-- The row's existence is the whole fact
-- ---------------------------------------------------------------------------
-- Shaped after event_dismissals rather than event_rsvps: there is no status to
-- carry, no aggregate to reconcile and nobody else to reconcile it with, so
-- unfollowing is a delete rather than a column flipping to 'unfollowed'. The
-- compound primary key is what makes the follow idempotent — following twice is
-- the same row, and the UI does not have to know whether it is inserting or
-- updating.
--
-- `followed_at` is kept because ordering by it is the obvious thing the first
-- screen that lists follows will want, and adding a column to a table people
-- already have rows in is more work than carrying one nobody reads yet.
--
-- ---------------------------------------------------------------------------
-- Nobody sees anybody else's
-- ---------------------------------------------------------------------------
-- There is no follower count and no "members who follow this", deliberately.
-- CONTEXT.md draws the line at content being public and people not being, and
-- who a member follows is a statement about them — a small one, but one they
-- did not make to the room. A count would also need a definer function to be
-- readable at all, which is a second thing to get wrong for a number nobody
-- has asked for.
--
-- The select policy is therefore the narrow one and there is no view. If a
-- follower count is ever wanted, it is a `security definer` function returning
-- a number, not a loosening of this.
--
-- ---------------------------------------------------------------------------
-- Paused members can unfollow but not follow
-- ---------------------------------------------------------------------------
-- The same split event_rsvps makes and for the same reason: somebody whose
-- membership is paused should still be able to take themselves off a list, and
-- should not be able to add themselves to one. Removing a member takes their
-- follows with them, because the row is `on delete cascade` — that is the same
-- cascade named on /admin's Remove panel, and this is one more thing in it.

create table if not exists public.organization_follows (
  member_id uuid not null references public.members (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (member_id, organization_id)
);

-- The lookup every screen does: "what does this member follow". The primary key
-- already leads on member_id, so it serves that; this one is for the reverse,
-- which a follower count would need and which nothing does yet.
create index if not exists organization_follows_organization_idx
  on public.organization_follows (organization_id);

comment on table public.organization_follows is
  'Which organizations a member follows. Private to that member — there is no follower count.';

alter table public.organization_follows enable row level security;

drop policy if exists "members read their own follows" on public.organization_follows;
create policy "members read their own follows"
  on public.organization_follows for select
  using (member_id = auth.uid());

drop policy if exists "members follow as themselves" on public.organization_follows;
create policy "members follow as themselves"
  on public.organization_follows for insert
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active')
  );

-- Deliberately not gated on active membership, the same way removing an RSVP is
-- not: somebody who has been paused should still be able to take their name off
-- a list.
drop policy if exists "members unfollow as themselves" on public.organization_follows;
create policy "members unfollow as themselves"
  on public.organization_follows for delete
  using (member_id = auth.uid());

-- No update policy. There is nothing to change: the row is the fact, and
-- changing either column would be following a different organization or
-- following as somebody else.

revoke all on public.organization_follows from anon, public;
grant select, insert, delete on public.organization_follows to authenticated;
