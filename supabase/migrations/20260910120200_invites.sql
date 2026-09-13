-- ============================================================================
-- invites — the list, and the gate that makes the club closed
-- ============================================================================
-- A member organization or a peer mentor puts a phone number on this list.
-- Nobody can join without a row here. The QR code gets somebody the app; it
-- does not get them in. See CONTEXT.md, "Why closed, specifically".
--
-- ---------------------------------------------------------------------------
-- Where the gate actually lives
-- ---------------------------------------------------------------------------
-- Two checks, on purpose, and they are not redundant:
--
--   1. A **Before User Created auth hook** rejects account creation for a
--      number that is not on this list. That is the enforcement — no
--      hand-written request routes around it.
--   2. The **members insert policy** below independently requires an invite.
--      So even an account that somehow exists cannot become a member row.
--
-- The client also checks before calling signInWithOtp, so an uninvited number
-- is told immediately instead of being texted. That check is a courtesy and a
-- cost control, never the gate.
--
-- ---------------------------------------------------------------------------
-- Phone normalization
-- ---------------------------------------------------------------------------
-- Numbers arrive typed by humans: "(408) 555-0112", "+1 408 555 0112",
-- "4085550112". Supabase auth stores the verified number as digits with the
-- country code and no '+'. A lookup that misses because of a bracket is a
-- member locked out of their own club, so every write and every read goes
-- through normalize_phone().
-- ============================================================================

create or replace function public.normalize_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    -- Bare 10-digit US number: assume +1, which is the only country the club
    -- operates in today. Revisit before launching anywhere else.
    when length(regexp_replace(coalesce(raw, ''), '\D', '', 'g')) = 10
      then '1' || regexp_replace(raw, '\D', '', 'g')
    else regexp_replace(coalesce(raw, ''), '\D', '', 'g')
  end;
$$;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),

  -- Always normalized. The generated column means a caller cannot insert an
  -- un-normalized number by forgetting to call the function.
  phone_raw text not null,
  phone text generated always as (public.normalize_phone(phone_raw)) stored,

  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'revoked')),

  -- Exactly one of these two. An invite comes from an organization or from a
  -- mentor, never from nobody and never from both.
  invited_by_member_id uuid references public.members (id) on delete set null,
  invited_by_organization_id uuid references public.organizations (id) on delete set null,
  constraint invites_one_inviter check (
    (invited_by_member_id is not null)::int + (invited_by_organization_id is not null)::int = 1
  ),

  note text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz
);

-- One live invite per number. A revoked invite does not block a fresh one,
-- which is what makes "let them back in" possible without deleting history.
create unique index if not exists invites_live_phone_idx
  on public.invites (phone)
  where status in ('pending', 'consumed');

alter table public.members drop constraint if exists members_invite_id_fkey;
alter table public.members
  add constraint members_invite_id_fkey
  foreign key (invite_id) references public.invites (id) on delete set null;

-- ---------------------------------------------------------------------- RLS
alter table public.invites enable row level security;

-- Deliberately no select policy for members: the invite list is not something
-- one member gets to read. Checking whether a number is on it goes through
-- has_active_invite() below, which answers yes or no and nothing else — so
-- nobody can enumerate the list or discover who invited whom.

drop policy if exists "mentors can see invites they sent" on public.invites;
create policy "mentors can see invites they sent"
  on public.invites for select
  using (invited_by_member_id = auth.uid());

-- The live-invite count is computed by a SECURITY DEFINER function rather than
-- a subquery. A policy on `invites` that sub-selects `invites` re-enters RLS on
-- the same table; routing it through a definer function keeps the policy from
-- reading the table it guards.
create or replace function public.live_invite_count(member_id uuid)
returns integer
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select count(*)::int from public.invites
  where invited_by_member_id = member_id
    and status in ('pending', 'consumed');
$$;

revoke all on function public.live_invite_count(uuid) from public;
grant execute on function public.live_invite_count(uuid) to authenticated;

-- A mentor gets two. Counted over live invites only, so revoking one returns
-- the allowance rather than spending it permanently.
drop policy if exists "mentors can invite up to two people" on public.invites;
create policy "mentors can invite up to two people"
  on public.invites for insert
  with check (
    invited_by_member_id = auth.uid()
    and exists (
      select 1 from public.members m
      where m.id = auth.uid() and m.type = 'mentor' and m.status = 'active'
    )
    and public.live_invite_count(auth.uid()) < 2
  );

drop policy if exists "mentors can revoke their own pending invites" on public.invites;
create policy "mentors can revoke their own pending invites"
  on public.invites for update
  using (invited_by_member_id = auth.uid() and status = 'pending')
  with check (invited_by_member_id = auth.uid());

-- ------------------------------------------------------------------- the gate
-- SECURITY DEFINER so it can see the invite list without granting anybody
-- select on it. It returns a boolean and nothing else: no id, no inviter, no
-- way to page through. Callable before sign-in, because the whole point is to
-- answer "is this number on the list" for somebody who is not yet a member.
create or replace function public.has_active_invite(raw_phone text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.invites
    where phone = public.normalize_phone(raw_phone)
      and status in ('pending', 'consumed')
  );
$$;

revoke all on function public.has_active_invite(text) from public;
grant execute on function public.has_active_invite(text) to anon, authenticated;

-- --------------------------------------------- members insert, gated on invite
-- Deferred from the members migration because it needs this table.
--
-- Three conditions, all required:
--   * the row is your own
--   * the phone on it is the one auth actually verified, not one you typed
--   * that verified number is on the list
drop policy if exists "members insert own row, and only with an invite" on public.members;
create policy "members insert own row, and only with an invite"
  on public.members for insert
  with check (
    auth.uid() = id
    and phone = public.normalize_phone(auth.jwt() ->> 'phone')
    and public.has_active_invite(auth.jwt() ->> 'phone')
  );

-- ------------------------------------------------------------ consume on join
-- Marks the invite used and records it on the member, in one place, so the
-- application cannot forget to.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_id uuid;
begin
  update public.invites
     set status = 'consumed', consumed_at = now()
   where phone = new.phone
     and status = 'pending'
  returning id into matched_id;

  new.invite_id := coalesce(new.invite_id, matched_id);
  return new;
end;
$$;

drop trigger if exists members_consume_invite on public.members;
create trigger members_consume_invite
  before insert on public.members
  for each row execute function public.consume_invite_for_new_member();
