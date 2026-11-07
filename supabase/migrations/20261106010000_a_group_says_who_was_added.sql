-- ============================================================================
-- A group says who was added
-- ============================================================================
-- The owner, 2026-11-06: when somebody is added to a group, say so in the
-- conversation. chat_add_to_group now leaves a line, "Jan added Sam", as
-- renaming a group does (20260930020000). Starting a group adds nobody (the
-- group is new); an event's group and an organization's are joined by the
-- dozen, and an org admin's add goes through add_organization_member, so
-- neither writes one.
--
-- subject_id is the member who was added, so the line can say "you" to them.
-- The body is a whole sentence, "Added Sam to the group", because the store
-- builds (1.0.5, 1.2.0) do not know this notice and show it as a bubble from
-- whoever added Sam. Never pushed: push_notify_enqueue skips notices.
--
-- When Sam's account is deleted, subject_id goes null and the body loses the
-- name, as their own messages lose their author.
-- ============================================================================

alter table public.chat_messages
  add column subject_id uuid references public.members (id) on delete set null;

create index chat_messages_subject_idx on public.chat_messages (subject_id)
  where subject_id is not null;

comment on column public.chat_messages.subject_id is
  'On an added notice, the member who was added. See 20261106010000.';

alter table public.chat_messages drop constraint chat_messages_notice_check;
alter table public.chat_messages add constraint chat_messages_notice_check
  check (notice in ('renamed', 'pictured', 'unpictured', 'introduced', 'added'));

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
      or (notice = 'added' and char_length(btrim(body)) between 1 and 100 and cardinality(attachments) = 0)
    )
  )
);

-- Only the server writes it.
alter table public.chat_messages add constraint chat_messages_subject_is_added
  check (subject_id is null or coalesce(notice = 'added', false));

comment on column public.chat_messages.notice is
  'Set on a line that records something, not something said: renamed, pictured or unpictured (chat_rename_group, chat_set_group_picture), introduced (answer_introduction, 20261029120000), or added (chat_add_to_group, 20261106010000).';

-- ------------------------------------------------ a deleted member's name --
create or replace function private.added_notice_forgets_the_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := 'Added a deleted member to the group';
  return new;
end;
$$;

create trigger chat_messages_added_forgets_the_name
  before update of subject_id on public.chat_messages
  for each row
  when (old.notice = 'added' and old.subject_id is not null and new.subject_id is null)
  execute function private.added_notice_forgets_the_name();

-- ------------------------------------------------------------ the writer --
-- As 20261030020000, and the line once the member is in.
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
  added integer;
  their_name text;
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
  get diagnostics added = row_count;

  if added = 1 then
    select btrim(m.display_name) into their_name
      from public.members m where m.id = new_member;
    insert into public.chat_messages (thread_id, author_id, body, notice, subject_id)
    values (thread, auth.uid(), 'Added ' || their_name || ' to the group', 'added', new_member);
  end if;
end;
$$;

revoke all on function public.chat_add_to_group(uuid, uuid) from public, anon;
grant execute on function public.chat_add_to_group(uuid, uuid) to authenticated;
