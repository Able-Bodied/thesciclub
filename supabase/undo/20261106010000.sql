-- Undo for 20261106010000_a_group_says_who_was_added.sql: no line when somebody
-- is added, and chat_add_to_group as 20261030020000 left it. The lines written
-- are deleted. Deploy the web code without subject_id first.

delete from public.chat_messages where notice = 'added';

drop trigger if exists chat_messages_added_forgets_the_name on public.chat_messages;
drop function if exists private.added_notice_forgets_the_name();

alter table public.chat_messages drop constraint if exists chat_messages_subject_is_added;
alter table public.chat_messages drop column if exists subject_id;

alter table public.chat_messages drop constraint chat_messages_notice_check;
alter table public.chat_messages add constraint chat_messages_notice_check
  check (notice in ('renamed', 'pictured', 'unpictured', 'introduced'));

alter table public.chat_messages drop constraint chat_messages_notice_shape;
alter table public.chat_messages add constraint chat_messages_notice_shape check (
  notice is null
  or (
    reply_to is null
    and (
      removed_at is not null
      or (notice = 'renamed' and char_length(btrim(body)) between 1 and 60 and cardinality(attachments) = 0)
      or (notice = 'pictured' and body = '' and cardinality(attachments) = 1)
      or (notice = 'unpictured' and body = '' and cardinality(attachments) = 0)
      or (notice = 'introduced' and char_length(btrim(body)) between 1 and 500 and cardinality(attachments) = 0)
    )
  )
);

create or replace function public.chat_add_to_group(thread uuid, new_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_kind text;
  attached_event uuid;
  attached_organization uuid;
  roster_size integer;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can add somebody to a group.' using errcode = '42501';
  end if;

  select t.organization_id into attached_organization
    from public.chat_threads t where t.id = thread;

  if attached_organization is not null
     and (public.speaks_for(attached_organization) or public.is_admin()) then
    perform public.add_organization_member(attached_organization, new_member);
    return;
  end if;

  -- Being in it is the whole permission. There is no owner of a group and no
  -- invite to accept: anybody in the conversation can bring somebody into it,
  -- which is what "a named few" means, and anybody can leave.
  if not public.is_thread_member(thread) then
    raise exception 'There is no such group.' using errcode = 'P0002';
  end if;

  select t.kind, t.event_id into thread_kind, attached_event
    from public.chat_threads t where t.id = thread;

  if thread_kind <> 'group' then
    raise exception 'A conversation between two people does not take a third.'
      using errcode = '22023';
  end if;

  if attached_event is not null then
    raise exception 'Everybody going to the event is already welcome in its group chat, and joins it themselves.'
      using errcode = '22023';
  end if;

  if new_member is null then
    raise exception 'There is nobody to add.' using errcode = '22023';
  end if;

  -- Before the cap, so that adding somebody who is already in a full group is
  -- the no-op it looks like rather than a refusal.
  if exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = thread and m.member_id = new_member
  ) then
    return;
  end if;

  select count(*) into roster_size
    from public.chat_thread_members m where m.thread_id = thread;
  if roster_size >= public.chat_group_cap() then
    raise exception 'This group holds % members and is full.', public.chat_group_cap()
      using errcode = '22023';
  end if;

  if not public.chat_is_findable(new_member) then
    raise exception 'That member cannot be added to a group.' using errcode = 'P0002';
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (thread, new_member)
  on conflict (thread_id, member_id) do nothing;
end;
$$;

revoke all on function public.chat_add_to_group(uuid, uuid) from public, anon;
grant execute on function public.chat_add_to_group(uuid, uuid) to authenticated;
