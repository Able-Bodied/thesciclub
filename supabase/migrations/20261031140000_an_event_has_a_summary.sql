-- ============================================================================
-- An event has a summary
--
-- The owner, 2026-10-31: the first lines of an imported description are often
-- "very random text". A card reads detail_summary instead: a sentence or two on
-- what the event is. A card without one shows no words. Nothing writes it yet:
-- the first ones were written by hand to see how it looks.
--
-- Changing the title or the words empties it, so a summary is never of an older
-- version of the event. Only those two: a write of the summary fires nothing.
-- ============================================================================

alter table public.events add column detail_summary text;

grant select (detail_summary) on public.events to anon, authenticated;

create function private.event_summary_follows_its_words()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.detail_summary := null;
  return new;
end;
$$;

create trigger events_summary_follows_their_words
  before update of title, description on public.events
  for each row
  when (old.title is distinct from new.title or old.description is distinct from new.description)
  execute function private.event_summary_follows_its_words();
