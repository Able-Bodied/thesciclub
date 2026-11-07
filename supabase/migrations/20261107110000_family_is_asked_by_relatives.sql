-- Linking family is asked for only by a member who said they are a relative
-- or spouse ("Which describes you best?": injury_type 'family'), of anyone
-- (the owner, 2026-11-07). Answering stays open to everyone asked.

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
  -- Only a member who joined as a relative or spouse asks (the owner, 2026-11-07).
  if not exists (select 1 from public.members m where m.id = me and m.injury_type = 'family') then
    raise exception 'Only members who joined as a relative or spouse can link family.'
      using errcode = 'P0001';
  end if;
  if p_relation is null or p_relation not in ('spouse', 'parent', 'child', 'sibling', 'family') then
    raise exception 'Choose how you are related.' using errcode = '22023';
  end if;
  if p_member is null or p_member = me
     or not exists (select 1 from public.browse_members b where b.id = p_member) then
    raise exception 'That member is not in the club.' using errcode = 'P0002';
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
