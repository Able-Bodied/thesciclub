-- Three strikes is a limit, not a label.
--
-- 20260916040000 built the strikes and said "three strikes flags; it does not
-- fire" — meaning no trigger removes anybody, because removing cascades through
-- event_rsvps and event_dismissals and takes a member's whole "Been to" record
-- with it, and because the club's shape is that membership is taken by a person
-- who can be asked why. All of that still holds and none of it is changed here.
--
-- What it did not do was stop a fourth. `admin_add_strike` counted nothing
-- before inserting, so an administrator could hand out five, and the owner
-- found it by doing exactly that. A limit that only appears in the wording of a
-- card is not a limit: "one more ends your membership" was printed at two, and
-- then the fourth went in and the sentence was simply wrong.
--
-- ---------------------------------------------------------------------------
-- What the third strike does now
-- ---------------------------------------------------------------------------
-- It is the last one. The function refuses a fourth and says what to do
-- instead, and /admin, on the strike that reaches the limit, asks the
-- administrator to pause or remove the member there and then.
--
-- That is still a person deciding — the prompt is a prompt, "Not now" is one of
-- the answers, and nothing in the database ends a membership by itself. The
-- difference is that the decision is now *asked for* at the moment it is owed,
-- instead of being left to somebody noticing a red count on a roster later.
--
-- ---------------------------------------------------------------------------
-- The cap is enforced where the writes are
-- ---------------------------------------------------------------------------
-- `member_strikes` has no insert policy — every strike goes through this
-- function — so a check inside it is the enforcement point, not a convenience
-- for the client. The `for update` on the member row is what makes it hold
-- rather than merely usually hold: without it two administrators striking the
-- same person at the same instant both read two and both insert, and the club
-- ends up with the four this migration exists to prevent. Locking the member
-- serialises strikes against that one member and nothing else.
--
-- ---------------------------------------------------------------------------
-- It returns the new count
-- ---------------------------------------------------------------------------
-- Which is why the function is dropped and recreated rather than replaced.
-- /admin has to know whether the strike it just issued was the third, and the
-- alternative is the client counting for itself — a second implementation of
-- active_strike_count() that would drift from this one and then disagree with
-- it about whose membership needs deciding.

-- One place for the number, the way strike_window() is one place for the year.
-- The card, the roster and the function that issues them cannot disagree about
-- what three means if only one of them says it.
create or replace function public.strike_limit()
returns integer
language sql
immutable
as $$ select 3 $$;

comment on function public.strike_limit() is
  'How many strikes a membership survives. Mirrored by STRIKE_LIMIT in standing-api.ts.';

drop function if exists public.admin_add_strike(uuid, text);

create function public.admin_add_strike(target uuid, strike_reason text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_admin boolean;
  counting integer;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if length(btrim(coalesce(strike_reason, ''))) = 0 then
    raise exception 'A strike needs a reason';
  end if;

  -- `for update` and not a bare select: see the header. It holds the member
  -- row for the rest of this transaction, so a second administrator striking
  -- the same person waits and then reads the count this one wrote.
  select is_admin into target_is_admin from public.members where id = target for update;
  if not found then
    raise exception 'No such member';
  end if;
  -- The same guard the other three carry, for the same reason: nothing about
  -- an administrator's membership is changed from the application.
  if target_is_admin then
    raise exception 'An administrator cannot be given a strike';
  end if;

  -- The refusal names the two things that can be done instead, because an
  -- administrator reaching for a fourth strike wants the membership dealt
  -- with and a bare "no" would leave them looking for how.
  if public.active_strike_count(target) >= public.strike_limit() then
    raise exception 'They are already on % strikes. Pause or remove them instead, or withdraw one.',
      public.strike_limit();
  end if;

  insert into public.member_strikes (member_id, reason, issued_by)
  values (target, btrim(strike_reason), auth.uid());

  select public.active_strike_count(target) into counting;
  return counting;
end;
$$;

revoke all on function public.admin_add_strike(uuid, text) from public, anon;
grant execute on function public.admin_add_strike(uuid, text) to authenticated;
grant execute on function public.strike_limit() to authenticated, anon;
