-- Photographs in chat: up to four on a message or a post, in a private bucket
-- that answers only to the people who could read the words beside them.
--
-- Asked for by the owner on 2026-09-21, with the limits decided the same day:
-- photographs yes, video no, four per message or post, downscaled on the
-- phone before upload (1,600px webp, ~150–300KB — see src/lib/chat/
-- attachments.ts), and anything over 10MB refused before it is even read.
-- Video was left out on cost: a phone cannot shrink one before upload, a
-- thirty-second clip is 30–100MB, and egress bills per view.
--
-- ---------------------------------------------------------------------------
-- The bucket is private, and that is the whole design
-- ---------------------------------------------------------------------------
-- `photos` is public — anybody with the URL reads it — which is right for a
-- profile picture and wrong for a picture of somebody's pressure sore sent to
-- one other person. `chat` is private: there is no public URL, every read goes
-- through the storage API with the member's own token, and the select policy
-- below asks exactly the question the message's own policy asks. A photograph
-- in a direct conversation is readable by its two members and nobody else,
-- including an administrator; one in a room is readable by whoever can read
-- the room.
--
-- The path carries the answer. `threads/<thread_id>/<file>` and
-- `rooms/<room_id>/<file>`: the second folder is what the policy checks with
-- `is_thread_member()` or `chat_room_is_readable()`, the same two gates the
-- words are behind. A file uploaded under a thread the uploader is not in is
-- refused at upload, not at read.
--
-- ---------------------------------------------------------------------------
-- The paths live on the row, not in a table of their own
-- ---------------------------------------------------------------------------
-- `attachments text[]` on chat_messages and chat_posts, capped at four by a
-- check constraint. A join table would buy nothing here: the paths are written
-- once with the message, read with it, and blanked with it. Insert is granted
-- on the column the way it is on `body`, so the client names it in the same
-- insert and the policies that decide the words decide the pictures.
--
-- A message may be pictures alone. The body check used to insist on words;
-- now it insists on words *or* at least one picture.
--
-- ---------------------------------------------------------------------------
-- Removal blanks the list; the files go through the API
-- ---------------------------------------------------------------------------
-- `chat_remove_message` and `chat_remove_post` set `attachments` to empty as
-- they blank the body, and record what was there in `chat_removed_bodies` so
-- the record is whole. The files themselves cannot be deleted from SQL —
-- Supabase's `storage.protect_delete()` refuses every direct delete from
-- storage.objects (see supabase/tests/photo-cleanup.sql for the afternoon
-- that cost) — so the client deletes them through the storage API right after
-- the function returns, under the delete policy below: the uploader or an
-- administrator. A file that outlives a failed delete is still behind the
-- read policy, so the worst case is a byte count, not a disclosure.
--
-- A removed member's photographs stay, the way their words do (decision 3
-- in HANDOFF.md: their posts and messages keep their text and lose their
-- name). Not only by principle: the storage API deletes only what the caller
-- can *select*, and an administrator cannot select a picture in a
-- conversation they are not in — `pnpm check-chat-photo-policy` proves that
-- an administrator's delete of such a file is a no-op. Letting them select
-- it for the sake of deleting it would let them read it, which is the one
-- thing this bucket exists to prevent. So the files stay behind their read
-- policy, readable by exactly the people who could read them before, and
-- the cost is bytes.
--
-- ---------------------------------------------------------------------------
-- A reported photograph is disclosed the way a reported sentence is
-- ---------------------------------------------------------------------------
-- The report copies the words because a message can be taken back. It cannot
-- copy a file — no SQL can — so instead it records the paths, and the select
-- policy lets an administrator read a file *that is named on a report*. One
-- photograph, handed over by somebody who could see it, is the exact shape
-- reporting has had since 20260918150000; the rest of the conversation's
-- pictures stay shut. If the sender deletes the file after it is reported the
-- report keeps the path and the picture is gone, which is weaker than the
-- words' snapshot and is said so on the panel.

-- --------------------------------------------------------------- the columns
alter table public.chat_messages
  add column if not exists attachments text[] not null default '{}';
alter table public.chat_posts
  add column if not exists attachments text[] not null default '{}';

comment on column public.chat_messages.attachments is
  'Up to four paths in the private `chat` bucket, under threads/<thread_id>/. Blanked with the body on removal.';
comment on column public.chat_posts.attachments is
  'Up to four paths in the private `chat` bucket, under rooms/<room_id>/. Blanked with the body on removal.';

-- Four, and every entry under this row's own folder. The second half is what
-- stops a message in one conversation pointing at a picture from another —
-- the read policy would refuse the file anyway, but a row that lies about
-- where its pictures are is a row that lies.
--
-- A function rather than a subquery, because a check constraint may not hold
-- a subquery (SQLSTATE 0A000 — found by applying this, not by reading it).
-- Immutable: its answer depends on its arguments and nothing else.
create or replace function public.chat_paths_under(paths text[], prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p like prefix || '%'), true)
    from unnest(paths) as p;
$$;

alter table public.chat_messages drop constraint if exists chat_messages_attachments_check;
alter table public.chat_messages add constraint chat_messages_attachments_check check (
  cardinality(attachments) <= 4
  and public.chat_paths_under(attachments, 'threads/' || thread_id::text || '/')
);
alter table public.chat_posts drop constraint if exists chat_posts_attachments_check;
alter table public.chat_posts add constraint chat_posts_attachments_check check (
  cardinality(attachments) <= 4
  and public.chat_paths_under(attachments, 'rooms/')
);

-- Words or a picture. The old check was words, full stop.
alter table public.chat_messages drop constraint if exists chat_messages_check;
alter table public.chat_messages add constraint chat_messages_check check (
  char_length(body) <= 4000
  and (removed_at is not null or char_length(btrim(body)) > 0 or cardinality(attachments) > 0)
);
alter table public.chat_posts drop constraint if exists chat_posts_check;
alter table public.chat_posts add constraint chat_posts_check check (
  char_length(body) <= 4000
  and (removed_at is not null or char_length(btrim(body)) > 0 or cardinality(attachments) > 0)
);

-- The same column-level grant `body` has. See 20260918110000 for why insert
-- is never granted on the whole table.
grant insert (attachments) on public.chat_messages to authenticated;
grant insert (attachments) on public.chat_posts to authenticated;

-- What a removed message or post had, kept with its words.
alter table public.chat_removed_bodies
  add column if not exists attachments text[] not null default '{}';

-- --------------------------------------------------------- reports carry paths
-- Before the bucket's policies, which name this column.
alter table public.chat_reports
  add column if not exists attachments text[] not null default '{}';

comment on column public.chat_reports.attachments is
  'The reported message''s photographs, by path. What lets an administrator read exactly those files and no others.';

-- ----------------------------------------------------------------- the bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- 2MB and three image types, enforced by storage itself: the client sends
-- 1,600px webp, and a client that is not this one — or a browser that could
-- not encode webp and fell back to the original — still cannot put a 40MB
-- file or a video in here.

-- Path helpers. `storage.foldername('threads/<id>/x.webp')` is
-- {threads,<id>}; these name the two halves so the policies read as sentences.
create or replace function public.chat_file_kind(object_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (storage.foldername(object_name))[1];
$$;

create or replace function public.chat_file_scope(object_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (storage.foldername(object_name))[2];
$$;

-- May the caller see this file? The same two gates the words are behind.
-- Definer, because is_thread_member() is and the policy runs as the member.
create or replace function public.chat_file_is_readable(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  kind text := public.chat_file_kind(object_name);
  scope text := public.chat_file_scope(object_name);
begin
  if scope is null or (storage.foldername(object_name))[3] is not null then
    -- Exactly two folders deep. Anything else is not a chat file.
    return false;
  end if;
  if kind = 'threads' then
    begin
      return public.is_thread_member(scope::uuid);
    exception when invalid_text_representation then
      return false;
    end;
  elsif kind = 'rooms' then
    return public.chat_room_is_readable(scope);
  end if;
  return false;
end;
$$;

-- May the caller put a file here? Active, and able to post where it points.
create or replace function public.chat_file_is_writable(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  kind text := public.chat_file_kind(object_name);
  scope text := public.chat_file_scope(object_name);
begin
  if not public.is_active_member() then
    return false;
  end if;
  if scope is null or (storage.foldername(object_name))[3] is not null then
    return false;
  end if;
  if kind = 'threads' then
    begin
      return public.is_thread_member(scope::uuid);
    exception when invalid_text_representation then
      return false;
    end;
  elsif kind = 'rooms' then
    return public.chat_can_post_in(scope);
  end if;
  return false;
end;
$$;

-- A file an administrator may read because a member handed it over.
create or replace function public.chat_file_is_reported(object_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin()
     and exists (
       select 1 from public.chat_reports r
       where object_name = any (r.attachments)
     );
$$;

revoke all on function public.chat_file_kind(text) from public, anon;
revoke all on function public.chat_file_scope(text) from public, anon;
revoke all on function public.chat_file_is_readable(text) from public, anon;
revoke all on function public.chat_file_is_writable(text) from public, anon;
revoke all on function public.chat_file_is_reported(text) from public, anon;
grant execute on function public.chat_file_kind(text) to authenticated;
grant execute on function public.chat_file_scope(text) to authenticated;
grant execute on function public.chat_file_is_readable(text) to authenticated;
grant execute on function public.chat_file_is_writable(text) to authenticated;
grant execute on function public.chat_file_is_reported(text) to authenticated;

drop policy if exists "a member reads chat photographs they could read the words of" on storage.objects;
create policy "a member reads chat photographs they could read the words of"
  on storage.objects for select
  using (
    bucket_id = 'chat'
    and (public.chat_file_is_readable(name) or public.chat_file_is_reported(name))
  );

drop policy if exists "a member uploads a chat photograph where they may post" on storage.objects;
create policy "a member uploads a chat photograph where they may post"
  on storage.objects for insert
  with check (
    bucket_id = 'chat'
    and owner_id = auth.uid()::text
    and public.chat_file_is_writable(name)
  );

-- No update policy: a photograph is not replaced under a message.

drop policy if exists "the uploader or an administrator deletes a chat photograph" on storage.objects;
create policy "the uploader or an administrator deletes a chat photograph"
  on storage.objects for delete
  using (
    bucket_id = 'chat'
    and (owner_id = auth.uid()::text or public.is_admin())
  );

-- ------------------------------------------------ the first post, with pictures
-- The 3-argument form is dropped rather than left beside the new one: two
-- overloads that differ by a defaulted trailing argument are ambiguous to
-- PostgREST, and chat_create_room calls this with three arguments, which the
-- default serves.
drop function if exists public.chat_create_topic(text, text, text);

create or replace function public.chat_create_topic(
  room text,
  title text,
  body text,
  attachments text[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_topic uuid;
begin
  insert into public.chat_topics (room_id, title, author_id)
  values (room, btrim(title), auth.uid())
  returning id into new_topic;

  insert into public.chat_posts (topic_id, author_id, body, attachments)
  values (new_topic, auth.uid(), btrim(body), coalesce(attachments, '{}'));

  return new_topic;
end;
$$;

comment on function public.chat_create_topic(text, text, text, text[]) is
  'Start a topic and its first post — with up to four photographs — in one transaction. Invoker: the insert policies decide.';

revoke all on function public.chat_create_topic(text, text, text, text[]) from public, anon;
grant execute on function public.chat_create_topic(text, text, text, text[]) to authenticated;

-- ------------------------------------------------------- removal blanks both
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

create or replace function public.chat_remove_post(post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
begin
  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.chat_topics t
    where t.id = target.topic_id and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the person who wrote a post, or an administrator, can remove it.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    return;
  end if;

  insert into public.chat_removed_bodies (post_id, body, attachments, removed_by)
  values (target.id, target.body, target.attachments, auth.uid())
  on conflict (post_id) do nothing;

  update public.chat_posts
     set body = '',
         attachments = '{}',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;
end;
$$;

-- The three report functions, as 20260918190000 wrote them, with the paths
-- copied alongside the words.
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
     body_snapshot, attachments, written_at, place, topic_id, room_id, note)
  values
    ('post', 'room', target.id, auth.uid(), target.author_id,
     target.body, target.attachments, target.created_at,
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
     body_snapshot, attachments, written_at, place, note)
  values
    ('message', thread.kind, target.id, auth.uid(), target.author_id,
     target.body, target.attachments, target.created_at,
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
  -- Paths in the `chat` bucket. Readable by an administrator only because
  -- they are named here — see 20260918200000.
  attachments text[],
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
    r.attachments,
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
