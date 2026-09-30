-- A group is renamed, and given a picture of its own, by anybody in it — and
-- the conversation says who did it.
--
-- The owner, 2026-09-30, four answers:
--   - "add photos to group chats" means a picture for the group, shown on its
--     tile in the list and at the top of the conversation. (Photographs in a
--     group's messages have worked since 20260918200000.)
--   - Anybody in the group can rename it and change its picture. A group has
--     no owner (20260918130000): anybody in it adds, anybody leaves.
--   - An event's group keeps the event's name, and takes no picture either.
--     The name is how its members know which event it belongs to.
--   - Each change leaves a line in the conversation: "Jan renamed the group to
--     Tuesday swimmers". Nobody changes a group without a trace, and a hostile
--     name or picture is reportable like anything else said there.
--
-- ---------------------------------------------------------------------------
-- The line is a message, marked as a notice
-- ---------------------------------------------------------------------------
-- `chat_messages.notice` says which of three things happened, and the row is
-- otherwise an ordinary message by whoever did it: in time order with the
-- rest, delivered by the realtime the thread already subscribes to, counted
-- unread for everybody else, and moving the group to the top of the list.
-- A separate table would have meant a second list to merge into the first on
-- every screen that draws a conversation, and a second realtime channel.
--
--   renamed    — body is the new name.
--   pictured   — attachments holds the new picture's one path. Carrying the
--                path is what makes a reported picture readable to the
--                administrators, the same way a reported photograph is
--                (20260918210000), and what keeps it undeletable once reported.
--   unpictured — the picture was taken away. Neither words nor a path.
--
-- **A member cannot write a notice.** Insert on chat_messages is granted by
-- column (20260918110000) and `notice` is not granted, so the only way a row
-- gets one is the two functions below, which are definer and check what they
-- are asked to do. Otherwise anybody in a group could forge "Jan renamed the
-- group to …" under their own name, or worse under nobody's.
--
-- What a notice is not:
--   - Not editable (chat_edit_message refuses it). It records what happened.
--   - Not removable by the person it names (chat_remove_message refuses them).
--     Taking it back would be changing the group without a trace. An
--     administrator acting on a report can still remove it.
--   - Not replied to (chat_check_message_reply refuses it). A quote of
--     "renamed the group" answers nothing.
--   - Not a notification. push_notify_enqueue skips it: nobody's phone should
--     buzz because a group changed its name.
--
-- ---------------------------------------------------------------------------
-- The picture is a file in the group's own folder
-- ---------------------------------------------------------------------------
-- threads/<group id>/<file>, in the private `chat` bucket, which is where a
-- photograph in the group's messages already goes. So the storage policies
-- that exist already are the whole of the privacy: only somebody in the group
-- can upload there (chat_file_is_writable) and only somebody in the group can
-- read it (chat_file_is_readable). The picture is as private as the words.
-- `chat_threads.photo_path` names it; the check keeps it in that folder, on a
-- group, one level deep.
--
-- chat_set_group_picture checks the file is really there and really the
-- caller's — the check chat_add_first_post_photographs makes — so nobody
-- names a path somebody else uploaded, or one that was never uploaded at all.
--
-- ---------------------------------------------------------------------------
-- chat_my_threads gains two columns
-- ---------------------------------------------------------------------------
-- photo_path, and last_notice, so the list can say "Jan renamed the group"
-- rather than print the new name as if Jan had said it. A function's result
-- columns cannot be changed in place, so it is dropped and made again with
-- the same body plus those two. chat_unread_count reads it by name at run
-- time and needs nothing. The client released before this ignores the extra
-- columns, so the migration can go first, as it should.
-- ============================================================================

-- ------------------------------------------------------------ the columns
alter table public.chat_messages
  add column if not exists notice text
    check (notice in ('renamed', 'pictured', 'unpictured'));

comment on column public.chat_messages.notice is
  'Set on a line that records a change to the group, not something said: renamed, pictured or unpictured. Written only by chat_rename_group and chat_set_group_picture.';

-- A notice has no words to require. Otherwise the rule is unchanged.
alter table public.chat_messages drop constraint if exists chat_messages_check;
alter table public.chat_messages add constraint chat_messages_check check (
  char_length(body) <= 4000
  and (
    removed_at is not null
    or notice is not null
    or char_length(btrim(body)) > 0
    or cardinality(attachments) > 0
  )
);

-- Each notice has one shape while it stands; a removed one is blank like any
-- removed message. Never an answer to anything.
alter table public.chat_messages add constraint chat_messages_notice_shape check (
  notice is null
  or (
    reply_to is null
    and (
      removed_at is not null
      or (notice = 'renamed' and char_length(btrim(body)) between 1 and 60 and cardinality(attachments) = 0)
      or (notice = 'pictured' and body = '' and cardinality(attachments) = 1)
      or (notice = 'unpictured' and body = '' and cardinality(attachments) = 0)
    )
  )
);

-- Read like every other column. Not inserted: see the header.
grant select (notice) on public.chat_messages to authenticated;

alter table public.chat_threads
  add column if not exists photo_path text;

comment on column public.chat_threads.photo_path is
  'A group''s picture: a file in the chat bucket under threads/<id>/. Set only by chat_set_group_picture.';

alter table public.chat_threads add constraint chat_threads_photo_shape check (
  photo_path is null
  or (
    kind = 'group'
    and photo_path like 'threads/' || id::text || '/%'
    and position('/' in substr(photo_path, char_length('threads/' || id::text || '/') + 1)) = 0
  )
);

grant select (photo_path) on public.chat_threads to authenticated;

-- ------------------------------------------------------- renaming a group
-- `group_thread` and `new_name`, not `thread` and `name`: inside plpgsql a
-- parameter with a column's name is ambiguous against that column, and this
-- writes chat_threads.name. PostgREST sends arguments by name.
create or replace function public.chat_rename_group(group_thread uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_threads;
  -- Whitespace collapsed, as a room's name is (chat_create_room), so
  -- "Saturday   ride" is not a different name from "Saturday ride".
  clean text := regexp_replace(btrim(coalesce(new_name, '')), '\s+', ' ', 'g');
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can rename a group.' using errcode = '42501';
  end if;

  select * into target from public.chat_threads t where t.id = group_thread;
  -- Definer, so RLS is off: being in the group is checked here or nowhere.
  -- Somebody outside it is told there is no such group, which is what the
  -- select policy tells them too.
  if not found or not public.is_thread_member(target.id) then
    raise exception 'There is no such group.' using errcode = 'P0002';
  end if;

  if target.kind <> 'group' then
    raise exception 'A conversation between two people has no name to change.'
      using errcode = '42501';
  end if;

  if target.event_id is not null then
    raise exception 'An event''s group is named after the event, so it keeps that name.'
      using errcode = '42501';
  end if;

  if char_length(clean) < 1 or char_length(clean) > 60 then
    raise exception 'A group needs a name of up to 60 characters.' using errcode = '22023';
  end if;

  if clean = target.name then
    raise exception 'That is already the group''s name.' using errcode = '22023';
  end if;

  update public.chat_threads set name = clean where id = target.id;

  insert into public.chat_messages (thread_id, author_id, body, notice)
  values (target.id, auth.uid(), clean, 'renamed');
end;
$$;

comment on function public.chat_rename_group(uuid, text) is
  'Rename a group the caller is in, and say so in the conversation. Not an event''s group.';

revoke all on function public.chat_rename_group(uuid, text) from public, anon;
grant execute on function public.chat_rename_group(uuid, text) to authenticated;

-- ------------------------------------------------ a group's picture
-- Null takes the picture away. The file itself is left where it is: the
-- notice that put it there still names it, and whoever uploaded it can delete
-- it through the storage API as they can any photograph of theirs.
create or replace function public.chat_set_group_picture(group_thread uuid, picture_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_threads;
  folder text;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can change a group''s picture.' using errcode = '42501';
  end if;

  select * into target from public.chat_threads t where t.id = group_thread;
  if not found or not public.is_thread_member(target.id) then
    raise exception 'There is no such group.' using errcode = 'P0002';
  end if;

  if target.kind <> 'group' then
    raise exception 'A conversation between two people has no picture of its own.'
      using errcode = '42501';
  end if;

  if target.event_id is not null then
    raise exception 'An event''s group keeps the event''s look, so it takes no picture.'
      using errcode = '42501';
  end if;

  if picture_path is null then
    if target.photo_path is null then
      raise exception 'The group has no picture to take away.' using errcode = '22023';
    end if;
    update public.chat_threads set photo_path = null where id = target.id;
    insert into public.chat_messages (thread_id, author_id, body, notice)
    values (target.id, auth.uid(), '', 'unpictured');
    return;
  end if;

  folder := 'threads/' || target.id::text || '/';
  if picture_path not like folder || '%'
     or position('/' in substr(picture_path, char_length(folder) + 1)) > 0 then
    raise exception 'That picture is not in this group.' using errcode = '22023';
  end if;

  -- Really uploaded, and by the caller. Without this a member could name a
  -- path somebody else in the group uploaded — a photograph from a message —
  -- and make it the group's face under their own name.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'chat' and o.name = picture_path and o.owner_id = auth.uid()::text
  ) then
    raise exception 'That picture has not been uploaded.' using errcode = '22023';
  end if;

  if picture_path = target.photo_path then
    raise exception 'That is already the group''s picture.' using errcode = '22023';
  end if;

  update public.chat_threads set photo_path = picture_path where id = target.id;

  insert into public.chat_messages (thread_id, author_id, body, attachments, notice)
  values (target.id, auth.uid(), '', array[picture_path], 'pictured');
end;
$$;

comment on function public.chat_set_group_picture(uuid, text) is
  'Set or take away the picture of a group the caller is in, and say so in the conversation. Not an event''s group.';

revoke all on function public.chat_set_group_picture(uuid, text) from public, anon;
grant execute on function public.chat_set_group_picture(uuid, text) to authenticated;

-- ------------------------------------------------ a notice is not edited
-- As 20260930000000 left it, with one check added after "your own message".
create or replace function public.chat_edit_message(message uuid, new_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_messages;
  clean text := btrim(coalesce(new_body, ''));
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can edit a message.' using errcode = '42501';
  end if;

  select * into target from public.chat_messages m where m.id = message;
  if not found then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  if not public.is_thread_member(target.thread_id) then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() then
    raise exception 'You can only edit your own message.' using errcode = '42501';
  end if;

  -- A notice records what happened to the group. Rename it again instead.
  if target.notice is not null then
    raise exception 'A line about a change to the group cannot be edited.' using errcode = '42501';
  end if;

  if target.removed_at is not null then
    raise exception 'That message has been removed.' using errcode = '42501';
  end if;

  if char_length(clean) > 4000 then
    raise exception 'A message is at most 4,000 characters.' using errcode = '22023';
  end if;
  if clean = '' and cardinality(target.attachments) = 0 then
    raise exception 'A message needs some words or a photograph.' using errcode = '22023';
  end if;

  if clean = target.body then
    raise exception 'Nothing changed.' using errcode = '22023';
  end if;

  insert into public.chat_edits (message_id, body, attachments, edited_by)
  values (target.id, target.body, target.attachments, auth.uid());

  update public.chat_messages
     set body = clean,
         edited_at = clock_timestamp()
   where id = target.id;
end;
$$;

-- ------------------------------------ a notice is not taken back by its author
-- As 20260918200000 left it, with one check added: the member a notice names
-- cannot remove it. An administrator acting on a report still can.
create or replace function public.chat_remove_message(message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_messages;
begin
  select * into target from public.chat_messages m where m.id = message;
  if not found then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  if not public.is_thread_member(target.thread_id) and not public.is_admin() then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the person who wrote a message, or an administrator, can remove it.'
      using errcode = '42501';
  end if;

  if target.notice is not null and not public.is_admin() then
    raise exception 'A line about a change to the group stays, so everybody can see who made it.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    return;
  end if;

  insert into public.chat_removed_bodies (message_id, body, attachments, removed_by)
  values (target.id, target.body, target.attachments, auth.uid())
  on conflict (message_id) do nothing;

  update public.chat_messages
     set body = '',
         attachments = '{}',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;
end;
$$;

-- ------------------------------------------------ a notice is not answered
-- As 20260930000000 left it, with one check added.
create or replace function public.chat_check_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.chat_messages;
begin
  if new.reply_to is null then
    return new;
  end if;

  select * into parent from public.chat_messages m where m.id = new.reply_to;
  if not found or parent.thread_id is distinct from new.thread_id then
    raise exception 'The message you are replying to is not in this conversation.';
  end if;
  if parent.removed_at is not null then
    raise exception 'The message you are replying to has been removed.';
  end if;
  if parent.notice is not null then
    raise exception 'That line is about a change to the group, so there is nothing to reply to.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------- a notice is not a notification
-- As 20260927020000 left it, with the message branch skipping notices.
create or replace function public.push_notify_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_table_name = 'chat_messages' then
    -- A group renamed is not worth anybody's lock screen. The line is in the
    -- conversation for whoever opens it next.
    if new.notice is null then
      perform public.push_notify_send('message', jsonb_build_object('id', new.id));
    end if;
  elsif tg_table_name = 'chat_posts' then
    perform public.push_notify_send('post', jsonb_build_object('id', new.id));
  elsif tg_table_name = 'chat_thread_members' then
    -- Only somebody added by somebody else; see the header.
    if actor is not null and actor <> new.member_id then
      perform public.push_notify_send('group_add', jsonb_build_object(
        'thread_id', new.thread_id, 'member_id', new.member_id, 'by', actor));
    end if;
  elsif tg_table_name = 'chat_reports' then
    perform public.push_notify_send('report', jsonb_build_object('id', new.id));
  elsif tg_table_name = 'members' then
    if new.invite_id is not null then
      perform public.push_notify_send('member_joined', jsonb_build_object('id', new.id));
    end if;
  end if;
  return null;
exception when others then
  raise warning 'push_notify_enqueue: %', sqlerrm;
  return null;
end;
$$;

-- ------------------------------------------- a reported notice says what it was
-- As 20260918200000 left it, except the words handed over. A notice's body is
-- a bare name or nothing, and "Tuesday swimmers" alone on the administrators'
-- screen says nothing about what was done. So the snapshot is the sentence.
create or replace function public.chat_report_message(message uuid, report_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_messages;
  thread public.chat_threads;
begin
  if not public.is_member() then
    raise exception 'Only a member can report something.' using errcode = '42501';
  end if;

  select * into target from public.chat_messages m where m.id = message;
  if not found then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  -- **The check this whole function rests on.** Definer, so RLS is off and the
  -- select policy on chat_messages is not protecting anything in here. Without
  -- this line anybody holding a message id could push a private message onto
  -- the administrators' screen. See 20260918150000.
  if not public.is_thread_member(target.thread_id) then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  select * into thread from public.chat_threads t where t.id = target.thread_id;

  if target.author_id = auth.uid() then
    raise exception 'You cannot report your own message. Remove it instead.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    raise exception 'That message has already been removed.' using errcode = '42501';
  end if;

  insert into public.chat_reports
    (kind, context_kind, message_id, reporter_id, reported_author_id,
     body_snapshot, attachments, written_at, place, note)
  values
    ('message', thread.kind, target.id, auth.uid(), target.author_id,
     case target.notice
       when 'renamed' then 'Renamed the group to “' || target.body || '”'
       when 'pictured' then 'Changed the group''s picture'
       when 'unpictured' then 'Took the group''s picture away'
       else target.body
     end,
     target.attachments, target.created_at,
     -- A group is named; a pair is not.
     case when thread.kind = 'group' then thread.name else 'A direct conversation' end,
     nullif(btrim(coalesce(report_note, '')), ''))
  on conflict (reporter_id, message_id) do nothing;
end;
$$;

-- ------------------------------------------------ the list, with two columns
drop function if exists public.chat_my_threads();

create function public.chat_my_threads()
returns table (
  id uuid,
  kind text,
  name text,
  event_id uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  member_count bigint,
  other_member_id uuid,
  last_body text,
  last_author_id uuid,
  last_at timestamptz,
  last_removed boolean,
  unread boolean,
  photo_path text,
  last_notice text
)
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    t.kind,
    t.name,
    t.event_id,
    t.created_at,
    t.last_message_at,
    (select count(*) from public.chat_thread_members c where c.thread_id = t.id) as member_count,
    (
      select o.member_id
      from public.chat_thread_members o
      where o.thread_id = t.id and o.member_id <> auth.uid() and t.kind = 'direct'
      limit 1
    ) as other_member_id,
    newest.body as last_body,
    newest.author_id as last_author_id,
    newest.created_at as last_at,
    newest.removed_at is not null as last_removed,
    exists (
      select 1
      from public.chat_messages n
      where n.thread_id = t.id
        and n.created_at > mine.last_read_at
        and n.author_id is distinct from auth.uid()
    ) as unread,
    t.photo_path,
    newest.notice as last_notice
  from public.chat_threads t
  join public.chat_thread_members mine
    on mine.thread_id = t.id and mine.member_id = auth.uid()
  left join lateral (
    select g.body, g.author_id, g.created_at, g.removed_at, g.notice
    from public.chat_messages g
    where g.thread_id = t.id
    order by g.created_at desc, g.id desc
    limit 1
  ) newest on true
  order by t.last_message_at desc;
$$;

comment on function public.chat_my_threads() is
  'Every conversation the caller is in, with its last message, its size, its picture and whether there is anything new. One round trip.';

revoke all on function public.chat_my_threads() from public, anon;
grant execute on function public.chat_my_threads() to authenticated;
