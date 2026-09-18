-- A mentor gets ten, not two.
--
-- The number was two from the first invites migration and has been written into
-- four places since: the insert policy, the policy's own *name*, CONTEXT.md, and
-- the sentence a mentor reads on /invites. The owner has raised it to ten.
--
-- ---------------------------------------------------------------------------
-- The number leaves the policy name
-- ---------------------------------------------------------------------------
-- "mentors can invite up to two people" was accurate for a year and is now the
-- kind of thing somebody reads in psql and believes. The policy is recreated as
-- "mentors can invite within their allowance", which stays true the next time
-- the figure moves, and the old name is dropped explicitly — a renamed policy
-- is a new policy, and leaving the old one in place would mean two insert
-- policies ORed, with the two-invite cap as the generous half. That is the same
-- trap as the ORed select policies on member_strikes, in its worst form: the
-- looser policy would win and the cap would be whichever one a given mentor
-- happened to satisfy.
--
-- ---------------------------------------------------------------------------
-- And moves into a function
-- ---------------------------------------------------------------------------
-- mentor_invite_limit(), the way strike_limit() and strike_window() are, so
-- the policy, the roster and the mentor's own screen cannot disagree about what
-- the allowance is. live_invite_count() is unchanged and still does the
-- counting: pending and consumed spend a slot, revoked does not, so withdrawing
-- returns the slot rather than burning it.
--
-- Nothing else about a mentor's invites changes. They still may not attach a
-- claim (20260910130000: "a mentor could hand a seeded person's identity to
-- anyone they liked"), still cannot revive a revoked row to get past the cap,
-- and an administrator still invites through admin_create_invite, which this
-- does not govern.

create or replace function public.mentor_invite_limit()
returns integer
language sql
immutable
as $$ select 10 $$;

comment on function public.mentor_invite_limit() is
  'How many live invites one mentor may hold. Mirrored by MENTOR_ALLOWANCE in mentor-invites.ts.';

-- Both historical names, because this policy has been recreated twice under the
-- old one and only the exact name drops.
drop policy if exists "mentors can invite up to two people" on public.invites;
drop policy if exists "mentors can invite within their allowance" on public.invites;

create policy "mentors can invite within their allowance"
  on public.invites for insert
  with check (
    invited_by_member_id = auth.uid()
    -- Still no claim on a mentor's invite. See 20260910130000.
    and seed_member_id is null
    and exists (
      select 1 from public.members m
      where m.id = auth.uid() and m.type = 'mentor' and m.status = 'active'
    )
    and public.live_invite_count(auth.uid()) < public.mentor_invite_limit()
  );

grant execute on function public.mentor_invite_limit() to authenticated, anon;
