-- The owner, 2026-11-01: its events are all in climbing gyms, so its pin is a
-- gym's rather than an outdoor one (20261101030000).
update public.organizations set category = 'gym' where name = 'ParaCliffHangers';
