-- A report says which kind of place it came from: a room, a group, or a direct
-- conversation.
--
-- Asked for by the owner on 2026-09-21, for one decision the Reports panel has
-- to make: whether to offer Remove. Removing a post from a room, or a message
-- from a group, protects everybody else who can see it. Removing a message
-- from a direct conversation protects nobody — the reporter has already read
-- it and the sender wrote it — and the remedy for a bad direct message is on
-- the member's row: a strike, a pause, or removal from the club. The report
-- keeps the copy either way, so nothing is lost by not offering the button.
--
-- ---------------------------------------------------------------------------
-- Recorded at report time, not derived later
-- ---------------------------------------------------------------------------
-- `kind` says post or message and cannot tell a group from a pair. The thread
-- could be joined at read time — until the message is deleted, at which point
-- message_id is null (every foreign key on chat_reports is ON DELETE SET NULL
-- so that the snapshot outlives what it copied) and there is nothing left to
-- join. Reading it off the `place` text ("A direct conversation") would work
-- and would be a sentence doing the job of a column. So it is a column, written
-- by the two report functions alongside the snapshot, and it survives whatever
-- happens to the original.
--
-- admin_chat_reports() returns it. Its return type changes, which `create or
-- replace` refuses, so it is dropped and recreated with its grants restated.
-- Nothing else about what it returns changes: still no thread id.
--
-- The three functions below are otherwise as 20260918150000 and
-- 20260918160000 wrote them; the only edits are the new column.

alter table public.chat_reports
  add column if not exists context_kind text not null default 'room'
  check (context_kind in ('room', 'group', 'direct'));
-- The default was for the add. Every report written from now on says which,
-- and the functions below always do. (No report existed anywhere when this
-- ran; the default is what let the column be not-null on a table that might.)
alter table public.chat_reports alter column context_kind drop default;

comment on column public.chat_reports.context_kind is
  'Where the reported thing was said: a room, a group, or a direct conversation. Written at report time; survives the original being deleted.';

-- --------------------------------------------------------------- a room post
create or replace function public.chat_report_post(post uuid, report_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
  topic public.chat_topics;
  room public.chat_rooms;
begin
  -- Definer, so RLS is off in here and nothing above has checked anything. The
  -- Phase 2 lesson: every gate this function relies on, it states itself.
  --
  -- is_member() and not is_active_member(): somebody who has been paused should
  -- still be able to say what was done to them. Being unable to write in a room
  -- is not the same as being unable to report what somebody wrote in one.
  if not public.is_member() then
    raise exception 'Only a member can report something.' using errcode = '42501';
  end if;

  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  select * into topic from public.chat_topics t where t.id = target.topic_id;
  select * into room from public.chat_rooms r where r.id = topic.room_id;

  -- The caller has to be able to read it. Without this, anybody holding a post
  -- id could push a closed room's contents onto the administrators' screen.
  if not public.chat_room_is_readable(topic.room_id) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id = auth.uid() then
    raise exception 'You cannot report your own post. Remove it instead.'
      using errcode = '42501';
  end if;

  -- A blank body is nothing to report, and a report whose snapshot is '' tells
  -- an administrator nothing. Whoever removed it has already acted.
  if target.removed_at is not null then
    raise exception 'That post has already been removed.' using errcode = '42501';
  end if;

  insert into public.chat_reports
    (kind, context_kind, post_id, reporter_id, reported_author_id,
     body_snapshot, written_at, place, topic_id, room_id, note)
  values
    ('post', 'room', target.id, auth.uid(), target.author_id,
     target.body, target.created_at,
     room.name || ' › ' || topic.title, topic.id, room.id,
     nullif(btrim(coalesce(report_note, '')), ''))
  -- Reporting twice is one row and no error. A member who taps it again
  -- because nothing visibly happened has not done anything wrong.
  on conflict (reporter_id, post_id) do nothing;
end;
$$;

comment on function public.chat_report_post(uuid, text) is
  'Hand one room post to the administrators, with a snapshot of what it said.';

revoke all on function public.chat_report_post(uuid, text) from public, anon;
grant execute on function public.chat_report_post(uuid, text) to authenticated;

-- ------------------------------------------------------------------ a message
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

  -- **The check this whole migration rests on.** Definer, so RLS is off and the
  -- select policy on chat_messages is not protecting anything in here. Without
  -- this line anybody holding a message id — and ids are uuids that leak from
  -- realtime payloads, error messages and screenshots — could push a private
  -- message onto the administrators' screen. That is a disclosure the two
  -- people in the conversation never chose, made by somebody who was not in it.
  --
  -- Not is_admin() as an alternative, unlike chat_remove_message. An
  -- administrator removing a message they were handed is acting on a report; an
  -- administrator *filing* one about a conversation they are not in is reading
  -- it.
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
     body_snapshot, written_at, place, note)
  values
    ('message', thread.kind, target.id, auth.uid(), target.author_id,
     target.body, target.created_at,
     -- A group is named; a pair is not. "A direct conversation" is all an
     -- administrator is told about where it was said, and all they need: the
     -- words, who wrote them and when are the report.
     case when thread.kind = 'group' then thread.name else 'A direct conversation' end,
     nullif(btrim(coalesce(report_note, '')), ''))
  on conflict (reporter_id, message_id) do nothing;
end;
$$;

comment on function public.chat_report_message(uuid, text) is
  'Hand one message to the administrators, with a snapshot of what it said. Nothing else in the conversation goes with it.';

revoke all on function public.chat_report_message(uuid, text) from public, anon;
grant execute on function public.chat_report_message(uuid, text) to authenticated;

-- ------------------------------------------------------ the administrators
drop function if exists public.admin_chat_reports();

create or replace function public.admin_chat_reports()
returns table (
  id uuid,
  kind text,
  -- room, group or direct. The panel offers Remove for the first two only.
  context_kind text,
  -- Null once the reported row itself is gone. The snapshot is what survives.
  post_id uuid,
  message_id uuid,
  body_snapshot text,
  written_at timestamptz,
  place text,
  -- A post's way back into the room. There is no equivalent for a message and
  -- there must not be — see the header.
  topic_id uuid,
  room_id text,
  note text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_author_id uuid,
  reported_author_name text,
  report_count bigint,
  already_removed boolean,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolution text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  -- Definer, so RLS is off in here and the table's own "your own rows" policy
  -- is not protecting anything. This line is the whole of the access control.
  if not public.is_admin() then
    raise exception 'Only an administrator can read the reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.context_kind,
    r.post_id,
    r.message_id,
    r.body_snapshot,
    r.written_at,
    r.place,
    r.topic_id,
    r.room_id,
    r.note,
    r.created_at,
    r.reporter_id,
    reporter.display_name,
    r.reported_author_id,
    author.display_name,
    (
      -- At least one, always: a report whose post or message row has since been
      -- deleted has nothing left to match on, and "0 people reported this" on a
      -- report is a sentence that cannot be true.
      select greatest(count(*), 1)
      from public.chat_reports peer
      where (r.post_id is not null and peer.post_id = r.post_id)
         or (r.message_id is not null and peer.message_id = r.message_id)
    ) as report_count,
    coalesce(
      (select p.removed_at is not null from public.chat_posts p where p.id = r.post_id),
      (select m.removed_at is not null from public.chat_messages m where m.id = r.message_id),
      -- Neither row is there any more: the topic or the thread was deleted
      -- under it. Gone is gone, and there is nothing left to remove.
      true
    ) as already_removed,
    r.resolved_at,
    r.resolved_by,
    resolver.display_name,
    r.resolution
  from public.chat_reports r
  left join public.members reporter on reporter.id = r.reporter_id
  left join public.members author on author.id = r.reported_author_id
  left join public.members resolver on resolver.id = r.resolved_by
  -- Open first, then newest first within each half. An administrator opens
  -- this screen to find what is waiting, not to browse what is done.
  order by (r.resolved_at is not null), r.created_at desc;
end;
$$;

comment on function public.admin_chat_reports() is
  'Every report, open ones first. No thread id and no neighbouring messages — one post or one message is all that was disclosed.';

revoke all on function public.admin_chat_reports() from public, anon;
grant execute on function public.admin_chat_reports() to authenticated;

-- ---------------------------------------------------------------- resolving
