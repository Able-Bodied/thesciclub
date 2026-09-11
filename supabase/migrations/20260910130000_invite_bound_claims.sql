-- ============================================================================
-- Claiming a seeded profile
-- ============================================================================
-- The club is seeded with NorCal SCI's mentor directory. Those 23 people have
-- no accounts. When one of them joins for real, they should end up with one
-- row, not two.
--
-- ---------------------------------------------------------------------------
-- Why the invite carries the claim, and not the person
-- ---------------------------------------------------------------------------
-- The obvious design — show the new member a list of seeded names and let them
-- pick themselves — is an impersonation vector, and a cheap one. Every seeded
-- name is already visible to every member in the Peers deck, so an attacker
-- with an invite does not have to guess: they choose a name, claim it, and walk
-- off with that person's photo, injury level and self-care details. The real
-- person is then locked out, because the claim deletes the seeded row.
--
-- Matching on the display name the new member types is the same hole with an
-- extra tap: the attacker is the one answering "is this you?".
--
-- So the claim is asserted by whoever issued the invite. NorCal SCI, adding
-- Bob's number to the list, says which seeded profile that number belongs to.
-- The person signing up never chooses. That is the same trust chain the club
-- already runs on: an organization vouches for you.
--
-- Name matching still has a place — at invite time, prompting the organization
-- "there is a seeded profile for Bob, link it?" — but that is a UI affordance
-- for a trusted party, not an authorization mechanism, and it lives in the app
-- rather than here.
--
-- ---------------------------------------------------------------------------
-- Why mentors cannot set it
-- ---------------------------------------------------------------------------
-- Mentors get two invites each. If a mentor could point an invite at a seeded
-- row, they could hand a seeded person's identity to anyone they liked. The
-- seeded directory came from an organization, so only an organization can link
-- to it. Enforced by the policy below, not by the UI.
--
-- ---------------------------------------------------------------------------
-- Claiming does not re-key the seeded row
-- ---------------------------------------------------------------------------
-- Changing a member's primary key to the new auth id would break every foreign
-- key that will eventually point at members — RSVPs, messages, invites sent.
-- Instead, claiming is *pre-filling onboarding*: both paths insert an ordinary
-- new row through the ordinary policy, and the only difference is whether the
-- fields arrive populated. The seeded row is deleted on successful insert
-- either way, which is what guarantees one row per person.
-- ============================================================================

alter table public.invites
  add column if not exists seed_member_id uuid references public.members (id) on delete set null;

comment on column public.invites.seed_member_id is
  'The seeded profile this invite entitles its holder to claim. Set only by an organization; never by a mentor.';

-- An invite from a mentor may not carry a claim. Organization invites are
-- created by the service role and are not covered by this policy.
drop policy if exists "mentors can invite up to two people" on public.invites;
create policy "mentors can invite up to two people"
  on public.invites for insert
  with check (
    invited_by_member_id = auth.uid()
    and seed_member_id is null
    and exists (
      select 1 from public.members m
      where m.id = auth.uid() and m.type = 'mentor' and m.status = 'active'
    )
    and public.live_invite_count(auth.uid()) < 2
  );

-- A mentor revoking an invite must not be able to attach a claim to it either.
drop policy if exists "mentors can revoke their own pending invites" on public.invites;
create policy "mentors can revoke their own pending invites"
  on public.invites for update
  using (invited_by_member_id = auth.uid() and status = 'pending')
  with check (invited_by_member_id = auth.uid() and seed_member_id is null);

-- ---------------------------------------------------------------- the trigger
-- Extends the existing consume-on-join trigger: the same statement that marks
-- an invite used now also retires the seeded row it pointed at.
--
-- `and is_seed` is the load-bearing part of the delete. Without it, an invite
-- pointing at a real member's id would delete a real member — so the guard is
-- what stops a mistaken or malicious invite from being a deletion primitive.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_id uuid;
  claimed_id uuid;
begin
  update public.invites
     set status = 'consumed', consumed_at = now()
   where phone = new.phone
     and status = 'pending'
  returning id, seed_member_id into matched_id, claimed_id;

  new.invite_id := coalesce(new.invite_id, matched_id);

  -- Retire the seeded profile, whether or not the member chose to carry its
  -- data across. Declining a claim still means that person now has a real row,
  -- and leaving the seeded one behind would be the duplicate we are avoiding.
  --
  -- RLS on this insert is evaluated after this trigger, so a refused insert
  -- rolls the deletion back with it.
  if claimed_id is not null then
    delete from public.members where id = claimed_id and is_seed;
  end if;

  return new;
end;
$$;
