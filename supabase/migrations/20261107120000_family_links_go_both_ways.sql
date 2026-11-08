-- Who links family (the owner, 2026-11-07, after 20261107110000): a member
-- who joined as a relative or spouse asks anyone; any other member, not a
-- professional, asks a relative or spouse. Organization accounts are not
-- family. src/lib/family.ts mayLinkFamily says the same.

create function private.may_link_family(p_asker uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select a.type <> 'organization' and t.type <> 'organization'
       and (a.injury_type = 'family'
            or (a.injury_type is distinct from 'professional' and t.injury_type = 'family'))
      from public.members a, public.members t
     where a.id = p_asker and t.id = p_member
  ), false);
$$;
revoke all on function private.may_link_family(uuid, uuid) from public;

create or replace function public.ask_family_link(p_member uuid, p_relation text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
  existing public.family_links;
  made uuid;
begin
  if not public.is_member() then
    raise exception 'Sign in to link family.' using errcode = '42501';
  end if;
  if p_relation is null or p_relation not in ('spouse', 'parent', 'child', 'sibling', 'family') then
    raise exception 'Choose how you are related.' using errcode = '22023';
  end if;
  if p_member is null or p_member = me
     or not exists (select 1 from public.browse_members b where b.id = p_member) then
    raise exception 'That member is not in the club.' using errcode = 'P0002';
  end if;
  if not private.may_link_family(me, p_member) then
    raise exception 'Family links are between a member who joined as a relative or spouse and another member.'
      using errcode = 'P0001';
  end if;

  select * into existing from public.family_links f
   where least(f.asker_id, f.answerer_id) = least(me, p_member)
     and greatest(f.asker_id, f.answerer_id) = greatest(me, p_member)
   for update;
  if found then
    if existing.status = 'linked' then
      raise exception 'You are already linked as family.' using errcode = 'P0001';
    elsif existing.asker_id = me then
      raise exception 'You already asked. They have not said yes yet.' using errcode = 'P0001';
    elsif existing.status = 'asked' then
      raise exception 'They already asked you. Answer on their profile.' using errcode = 'P0001';
    end if;
    -- They asked once and this member said no; now this member asks.
    delete from public.family_links where id = existing.id;
  end if;

  if (select count(*) from public.family_links f
       where f.asker_id = me and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have asked 10 people today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.family_links (asker_id, answerer_id, relation)
  values (me, p_member, p_relation)
  returning id into made;

  insert into public.notifications (member_id, kind, tag, actor_id, family_link_id, detail)
  values (p_member, 'family_link', 'family:' || made::text || ':asked', me, made, 'asked');
  perform public.push_notify_send('family_link', jsonb_build_object('id', made, 'step', 'asked'));
  return made;
end;
$$;
