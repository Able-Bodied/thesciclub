-- ============================================================================
-- Seed: the member organizations
-- ============================================================================
-- Six real organizations, from the design mock's own list. The first three can
-- put phone numbers on the club's list; the others run events and appear as
-- affiliations on member profiles but cannot let anybody in.
--
-- Ids are derived from the short code so the same organization is always the
-- same row, and a member's `affiliations` array can be matched against `name`
-- without a join table.
--
-- Ordered after the organizations table (120000) and before the members seed
-- (120400), whose `affiliations` arrays name these organizations.
-- ============================================================================

insert into public.organizations (id, short_code, name, city, description, tags, can_invite)
values
  (
    '00000000-0000-4000-8000-00000000006e', 'NCS', 'NorCal SCI', 'Northern California',
    'The Northern California Spinal Cord Network runs the peer mentor programme every member of this club came in through. Volunteer mentors, support groups and a regional events calendar.',
    array['Peer mentoring', 'Support groups', 'Events']::text[], true
  ),
  (
    '00000000-0000-4000-8000-000000000073', 'SC', 'SCVMC SCI Peer Support', 'San Jose',
    'Weekly peer support at Santa Clara Valley Medical Center''s rehabilitation unit — including bedside visits for people who were injured in the last few weeks.',
    array['Newly injured', 'Hospital', 'Weekly']::text[], true
  ),
  (
    '00000000-0000-4000-8000-000000000077', 'WWM', 'Wheel with Me Foundation', 'East Bay',
    'Grants and programming that get people with mobility disabilities into adaptive sport and recreation.',
    array['Adaptive sport', 'Grants']::text[], true
  ),
  (
    '00000000-0000-4000-8000-000000000063', 'CC', 'Canine Companions', 'Santa Rosa',
    'Service dogs, placed free of charge, for people with disabilities. Two members here are long-time volunteers.',
    array['Service animals']::text[], false
  ),
  (
    '00000000-0000-4000-8000-000000000068', 'HF', 'High Fives Foundation', 'Truckee',
    'Support and adaptive winter sport for athletes who have sustained life-altering injuries.',
    array['Winter sports', 'Adaptive sport']::text[], false
  ),
  (
    '00000000-0000-4000-8000-000000000072', 'RC', 'ReCARES', 'Palo Alto',
    'Collects and redistributes gently used durable medical equipment at no cost.',
    array['Equipment', 'Reuse']::text[], false
  )
on conflict (id) do nothing;
