-- Undo for 20261105010000_the_directory_reads_places_once.sql. The app reads
-- the embedded organization_places again when the view is gone.

drop view if exists public.organization_directory;
