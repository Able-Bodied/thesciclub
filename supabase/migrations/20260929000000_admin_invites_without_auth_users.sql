-- ============================================================================
-- admin_invites stops reading auth.users directly
-- ============================================================================
-- Supabase's security advisor emailed the owner on 2026-09-27 with a critical
-- `auth_users_exposed` finding on this project: a view in the API's schema
-- that reads `auth.users`. `admin_invites` is the only one — it left-joined
-- `auth.users` on the invite's phone to say whether the number has signed up
-- (`has_account`) and when (`account_created_at`).
--
-- What it actually exposed, checked the same day: nothing. `anon` gets
-- "permission denied" (its grant was revoked when the view was made), and an
-- `authenticated` caller who is not an active administrator gets no rows,
-- because of `where public.is_admin()`. The two columns it took from
-- `auth.users` are a boolean and a date; the phone number comes from
-- `invites`, which administrators read anyway.
--
-- The advisor is still right about the shape. A view runs with its owner's
-- rights — here `postgres`, which bypasses RLS and can read every account —
-- so that one `where` line was the whole wall between the API and
-- `auth.users`. One careless `create or replace view` without it and every
-- signed-in member could read the account table. So:
--
-- 1. The lookup moves into `private.account_created_at(phone)`, a definer
--    function in a schema the API does not expose (config.toml's `schemas` is
--    public and graphql_public), and it checks `is_admin()` itself, so it
--    answers null to anybody else. `auth.users` is named nowhere the API can
--    reach.
--
--    `authenticated` has to be able to execute it, and that is not a
--    loosening. Postgres checks a function called inside a view against the
--    *reader*, not the view's owner — only table access runs as the owner. A
--    first draft revoked execute from every API role and the probe
--    (supabase/tests/admin-invites-no-auth-users.sql) found the result: the
--    administrator's own invite list failed with "permission denied for
--    function account_created_at". `anon` gets nothing, not even the schema.
-- 2. The view becomes a `security_barrier`, so the planner evaluates
--    `is_admin()` before any filter a caller supplies — a gate, rather than a
--    predicate the planner is free to reorder.
--
-- Same columns, same order, same types, so `create or replace` keeps the
-- existing grants (select to authenticated, nothing to anon) and the client
-- (src/routes/admin/members-admin.ts) needs no change.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.account_created_at(invite_phone text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  -- Its own gate, so the answer is the same whoever calls it and however:
  -- null unless the caller is an active administrator. Phone is unique in
  -- auth.users; limit 1 is belt and braces, so the view can never gain a row
  -- from a duplicate the way the old join could have.
  select u.created_at
    from auth.users u
   where public.is_admin() and u.phone = invite_phone
   limit 1;
$$;

revoke all on function private.account_created_at(text) from public, anon;
grant execute on function private.account_created_at(text) to authenticated;

create or replace view public.admin_invites
with (security_barrier = true)
as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  inviter.is_admin as invited_by_member_is_admin,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  (private.account_created_at(i.phone) is not null) as has_account,
  private.account_created_at(i.phone) as account_created_at
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join public.members holder on holder.phone = i.phone
where public.is_admin();

-- Restated rather than trusted to survive: this is the grant the advisor's
-- finding is about. `authenticated` also held insert, update, delete,
-- truncate, references and trigger here, from Supabase's default privileges
-- on the public schema — inert on a view that joins five tables, which
-- Postgres will not write through, but a read-only view grants reading only.
revoke all on public.admin_invites from anon, authenticated, public;
grant select on public.admin_invites to authenticated;
