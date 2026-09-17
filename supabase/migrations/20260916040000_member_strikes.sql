-- Strikes: what "Good standing" is standing on.
--
-- CONTEXT.md makes losing membership load-bearing — "a club where membership
-- cannot be lost is not a club" — and asks that it stay visible in the product
-- rather than behind a terms page. Until now the only visible form of that was
-- a sentence on Me listing the four things that end it, and the only mechanism
-- was Remove, which is all or nothing. A member could be warned privately and
-- have nothing to look at, or removed with no record of why.
--
-- ---------------------------------------------------------------------------
-- Three strikes flags; it does not fire
-- ---------------------------------------------------------------------------
-- The third strike does not remove anybody and does not pause them. It changes
-- what /admin shows and what the member reads, and an administrator still
-- presses Remove.
--
-- Removing cascades: event_rsvps and event_dismissals are `on delete cascade`,
-- so an automatic third strike would silently destroy the record of everything
-- somebody had been to — see "Been to". And the club's whole shape is that
-- membership is granted by a person and taken by a person; a trigger that ends
-- one has nobody behind it to answer for the moment it fired.
--
-- ---------------------------------------------------------------------------
-- A strike is never edited and never deleted
-- ---------------------------------------------------------------------------
-- Withdrawn, with a reason. A record of a warning that can be quietly rewritten
-- is not a record, and the case this protects is the one that matters: an
-- administrator who struck the wrong person should leave evidence of the
-- correction, not of nothing having happened.
--
-- ---------------------------------------------------------------------------
-- They stop counting after a year
-- ---------------------------------------------------------------------------
-- The row stays; it leaves the count. Otherwise one bad week leaves somebody
-- permanently one mistake from the door, which is a different punishment from
-- the one that was handed down.

create table if not exists public.member_strikes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  -- Required, and required for a reason: a strike somebody cannot read the
  -- cause of is unanswerable, and being unable to answer is what makes people
  -- leave quietly instead of correcting course.
  reason text not null check (length(btrim(reason)) > 0),
  issued_by uuid references public.members (id) on delete set null,
  issued_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_reason text,
  constraint withdrawn_has_a_reason check (
    withdrawn_at is null or length(btrim(coalesce(withdrawn_reason, ''))) > 0
  )
);

create index if not exists member_strikes_member_idx
  on public.member_strikes (member_id, issued_at desc);

comment on table public.member_strikes is
  'Warnings on the way to losing membership. Never edited, never deleted — withdrawn.';
comment on column public.member_strikes.withdrawn_at is
  'Set when a strike is taken back. A withdrawn strike stops counting and stays on the record.';

-- How long a strike counts for. One place, so the card, the roster and the
-- function that issues them cannot disagree about who is on two.
create or replace function public.strike_window()
returns interval
language sql
immutable
as $$ select interval '12 months' $$;

create or replace function public.active_strike_count(target uuid)
returns integer
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.member_strikes
   where member_id = target
     and withdrawn_at is null
     and issued_at > now() - public.strike_window();
$$;

-- ---------------------------------------------------------------------- RLS
-- A member reads their own, and nobody else's. Administrators read all of them
-- through admin_strikes below.
--
-- No other member can see a strike, ever. CONTEXT.md draws the line at content
-- being public and people not being, and this is the most sensitive thing that
-- could sit against a name — browse_members does not select it and must not.
alter table public.member_strikes enable row level security;

drop policy if exists "a member reads their own strikes" on public.member_strikes;
create policy "a member reads their own strikes"
  on public.member_strikes for select
  using (member_id = auth.uid());

drop policy if exists "an administrator reads every strike" on public.member_strikes;
create policy "an administrator reads every strike"
  on public.member_strikes for select
  using (public.is_admin());

-- Writes go through the functions below, which is why there is no insert or
-- update policy: an administrator issues a strike in their own name and the
-- function is what records that.
revoke all on public.member_strikes from anon, public;
grant select on public.member_strikes to authenticated;

-- --------------------------------------------------------------- the roster
drop view if exists public.admin_strikes;
create view public.admin_strikes as
select
  s.id,
  s.member_id,
  s.reason,
  s.issued_at,
  s.withdrawn_at,
  s.withdrawn_reason,
  issuer.display_name as issued_by_name,
  (s.withdrawn_at is null and s.issued_at > now() - public.strike_window()) as counts
from public.member_strikes s
left join public.members issuer on issuer.id = s.issued_by
where public.is_admin();

revoke all on public.admin_strikes from anon, public;
grant select on public.admin_strikes to authenticated;

-- The roster carries the count, so /admin does not need a query per row.
drop view if exists public.admin_members;

create view public.admin_members as
select
  m.id,
  m.display_name,
  m.phone,
  m.type,
  m.status,
  m.is_admin,
  m.is_seed,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.show_in_browse,
  m.created_at,
  m.updated_at,
  public.live_invite_count(m.id) as invites_used,
  public.active_strike_count(m.id) as strikes
from public.members m
where public.is_admin();

revoke all on public.admin_members from anon, public;
grant select on public.admin_members to authenticated;

-- ------------------------------------------------------------- issuing them
create or replace function public.admin_add_strike(target uuid, strike_reason text)
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
  if length(btrim(coalesce(strike_reason, ''))) = 0 then
    raise exception 'A strike needs a reason';
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  -- The same guard the other three carry, for the same reason: nothing about
  -- an administrator's membership is changed from the application.
  if target_is_admin then
    raise exception 'An administrator cannot be given a strike';
  end if;

  insert into public.member_strikes (member_id, reason, issued_by)
  values (target, btrim(strike_reason), auth.uid());
end;
$$;

create or replace function public.admin_withdraw_strike(strike uuid, withdraw_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if length(btrim(coalesce(withdraw_reason, ''))) = 0 then
    raise exception 'Withdrawing a strike needs a reason';
  end if;

  update public.member_strikes
     set withdrawn_at = now(), withdrawn_reason = btrim(withdraw_reason)
   where id = strike and withdrawn_at is null;

  if not found then
    raise exception 'No such strike, or it is already withdrawn';
  end if;
end;
$$;

revoke all on function public.admin_add_strike(uuid, text) from public, anon;
revoke all on function public.admin_withdraw_strike(uuid, text) from public, anon;
grant execute on function public.admin_add_strike(uuid, text) to authenticated;
grant execute on function public.admin_withdraw_strike(uuid, text) to authenticated;
grant execute on function public.active_strike_count(uuid) to authenticated;
