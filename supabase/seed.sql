-- ============================================================================
-- Local development seed — NOT pushed to any hosted project
-- ============================================================================
-- Runs on `supabase db reset` against the local stack only. Migrations go to
-- production; this file does not. That distinction is what makes it safe to put
-- test credentials here.
--
-- The three numbers below are the ones configured as Supabase test OTPs, so
-- they never send a real SMS:
--
--   11111111111 / 111111   invited  — should be able to join
--   12222222222 / 222222   NOT invited — should be refused
--   13333333333 / 333333   invited by a mentor, not an organization
--
-- The uninvited number is the important one. An invite gate that lets everybody
-- in looks exactly like a working one until a stranger walks through it, so the
-- negative case is the test that actually proves anything.
-- ============================================================================

-- Invited by an organization. It used to point at a seeded profile (the
-- claim path); the seeded directory was removed (20261010020000), so it is a
-- plain invite now. The claim probes make their own seeded row.
insert into public.invites (phone_raw, invited_by_organization_id, note)
select '(111) 111-1111', o.id, 'Local test: organization invite'
from public.organizations o
where o.short_code = 'NCS'
on conflict do nothing;

-- Invited by NorCal SCI too. This was one of the seeded mentors, so the
-- allowance had something to count against; with the directory removed
-- (20261010020000) the mentor allowance is exercised by mentor-invites.sql.
insert into public.invites (phone_raw, invited_by_organization_id, note)
select '13333333333', o.id, 'Local test: second invite'
from public.organizations o
where o.short_code = 'NCS'
on conflict do nothing;

-- 12222222222 is deliberately absent. Do not add it.

-- Deliberately written in two different formats above — "(111) 111-1111" and
-- "13333333333" — because the generated `phone` column has to normalize both to
-- the digits Supabase auth verifies. If normalization ever regresses, this seed
-- is where it shows up first.
