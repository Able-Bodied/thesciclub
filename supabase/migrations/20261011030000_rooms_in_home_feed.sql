-- Home curation is separate from whether a room is open and readable.
alter table public.chat_rooms
  add column show_in_home boolean not null default true;

create or replace function public.admin_set_room_home(room text, show_in_home boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change which rooms appear in Home.'
      using errcode = '42501';
  end if;
  if show_in_home is null then
    raise exception 'Choose whether the room appears in Home.' using errcode = '22004';
  end if;
  update public.chat_rooms r
     set show_in_home = admin_set_room_home.show_in_home
   where r.id = room
  returning r.show_in_home into saved;
  if not found then
    raise exception 'There is no room called %.', room using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke all on function public.admin_set_room_home(text, boolean) from public, anon;
grant execute on function public.admin_set_room_home(text, boolean) to authenticated;
