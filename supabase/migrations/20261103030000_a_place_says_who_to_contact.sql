-- ============================================================================
-- A place says who to contact there, and links its own page
-- ============================================================================
-- The owner, 2026-11-03: Team River Runner's chapters each say on their page
-- who to reach and how. Shown on the map, for the pin tapped, and on the
-- organization's page. As public as the place: its own site already says it.
-- save_organization_places keeps both, since it updates a place in place.
-- ============================================================================

alter table public.organization_places
  add column note text check (note is null or char_length(note) between 1 and 1500),
  add column url text check (url is null or (url ~ '^https://' and char_length(url) <= 500));

comment on column public.organization_places.note is
  'Who to contact at this place and how, as its own page says. See 20261103030000.';
comment on column public.organization_places.url is
  'This place''s own page. See 20261103030000.';

grant select (note, url) on public.organization_places to anon, authenticated;
