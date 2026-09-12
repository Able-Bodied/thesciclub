-- ============================================================================
-- Deleting a member actually removes them, and stops failing on mentors
-- ============================================================================
-- Two bugs in one path, both found by running the lifecycle rather than by
-- reading it. Both are in `admin_delete_member`, which is the only way an
-- account is ever removed.
--
-- A first pass at this described the first bug as a deleted member being
-- locked out of the club forever. That was backwards, and the correction is
-- worth keeping: they were not locked out at all — they could walk back in
-- unasked. What was locked was the deliberate route back.
--
-- ---------------------------------------------------------------------------
-- 1. Deleting a member did not keep them out
-- ---------------------------------------------------------------------------
-- Deletion left their invite sitting at 'consumed', and `has_active_invite`
-- accepts 'consumed' as readily as 'pending'. Both gates read that function —
-- the Before User Created auth hook and the members insert policy — so a
-- deleted member could sign in again and recreate their row unasked. Run
-- against a local stack, that is exactly what happens:
--
--   2. member deleted. invite still: consumed
--   3. can they walk back in unasked? has_active_invite = true
--   4. they recreated a member row: Gone again, invite_id NULL
--
-- The house rules say membership can be lost. It could not be. Removal is the
-- club's only sanction and it did not hold, which is the serious half of this.
--
-- The other half is the mirror image: the number could not be re-invited on
-- purpose either. `invites_live_phone_idx` is unique over pending *and*
-- consumed, so an administrator adding that number back got
--
--   ERROR: duplicate key value violates unique constraint "invites_live_phone_idx"
--
-- and nothing in the product could clear the row — `/admin` says so on the
-- screen: "Pending invites can be revoked; used ones cannot." So deletion was
-- broken in both directions at once: it could not keep somebody out, and it
-- could not let them back in.
--
-- Revoking on delete answers both. `has_active_invite` ignores 'revoked', so
-- the member is actually out; the unique index ignores it too, so a fresh
-- invite can be issued when somebody decides to let them back in. That is the
-- mechanism the schema already described four lines above the index: "A revoked
-- invite does not block a fresh one, which is what makes 'let them back in'
-- possible without deleting history." The row stays, with its revoked_at, so
-- who vouched for whom is still on record.
--
-- It also settles the allowance. `live_invite_count` counts pending and
-- consumed, so revoking returns the inviting mentor's slot — which is right:
-- the person they spent it on is gone.
--
-- ---------------------------------------------------------------------------
-- 2. Deleting a mentor who had issued invites failed with a constraint error
-- ---------------------------------------------------------------------------
--   ERROR: new row for relation "invites" violates check constraint
--          "invites_one_inviter"
--   CONTEXT: UPDATE ONLY "public"."invites" SET "invited_by_member_id" = NULL
--
-- `invited_by_member_id` is `on delete set null`, and `invites_one_inviter`
-- requires exactly one of member-or-organization to be set. Nulling the member
-- leaves neither, the check rejects it, and the whole delete aborts. Two
-- reasonable rules that cannot both hold at the moment an inviter leaves.
--
-- The check is relaxed to "never both" and the "at least one" half moves to an
-- insert trigger. That keeps the rule where it was actually meant — an invite
-- is always *created* by somebody — while allowing the state that follows from
-- it honestly: the inviter's account is gone, and the invite predates their
-- leaving. Encoding that as null is more truthful than blocking the delete or
-- than inventing an inviter to satisfy a constraint.
-- ============================================================================

-- --------------------------------------------------------------- constraint
alter table public.invites drop constraint if exists invites_one_inviter;
alter table public.invites
  add constraint invites_one_inviter check (
    (invited_by_member_id is not null)::int + (invited_by_organization_id is not null)::int <= 1
  );

create or replace function public.invites_require_inviter()
returns trigger
language plpgsql
as $$
begin
  if new.invited_by_member_id is null and new.invited_by_organization_id is null then
    raise exception 'An invite must come from a member organization or a mentor';
  end if;
  return new;
end;
$$;

-- Insert only. An invite that loses its inviter later is a fact about the past,
-- not a row somebody is creating from nobody.
drop trigger if exists invites_require_inviter on public.invites;
create trigger invites_require_inviter
  before insert on public.invites
  for each row execute function public.invites_require_inviter();

-- ------------------------------------------------------------------ deletion
create or replace function public.admin_delete_member(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account from here';
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  if target_is_admin then
    -- Deliberate: an administrator is removed by the service role, so two
    -- administrators cannot lock each other out of the club they run.
    raise exception 'An administrator cannot be deleted from the application';
  end if;

  -- Their own invite is revoked, which frees their number for a fresh one and
  -- returns the allowance to whoever spent it on them. Revoked, not deleted:
  -- the row keeps who vouched for them and when.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where id = (select invite_id from public.members where id = target)
     and status in ('pending', 'consumed');

  -- Invites they issued that nobody has used yet go with them. The issuer is
  -- the reason those numbers are on the list, and a standing invite from an
  -- account that no longer exists is a door left open by nobody.
  --
  -- Invites they issued that *were* used are left alone. Those are other
  -- members, already in, and revoking would free a number that is still spoken
  -- for. Their `invited_by_member_id` becomes null on the delete below, which
  -- is now allowed and is the honest record: the mentor who vouched has left.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = target
     and status = 'pending';

  -- The member row goes. The auth account behind it survives and is inert:
  -- browse_members yields nothing without a membership, and rejoining still
  -- requires an invite. Deleting the auth user needs the service role.
  delete from public.members where id = target;
end;
$$;

revoke all on function public.admin_delete_member(uuid) from public, anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;
