-- Undo for 20261106020000_connecting_several_or_into_a_group.sql. The groups
-- made stay, with whoever is in them, and their pairs stay in introductions;
-- only the record of each connection and the ways to make one go. Deploy the
-- web code without connect_members first.

drop function if exists public.my_connections();
drop function if exists public.my_connection_groups();
drop function if exists public.connect_members(uuid[], text, boolean, uuid, text);
drop function if exists private.may_connect_into(uuid, uuid);
alter table public.introductions drop column if exists connection_id;
drop table if exists public.connections;
