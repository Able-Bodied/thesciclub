-- ============================================================================
-- Rooms open to write; editing, with earlier versions kept; replies to a post
-- ============================================================================
-- Asked for by the owner on 2026-09-29, after Home's steps 1 and 2 went live
-- and before Likes. HOME-PLAN.md, decisions 8 to 12. Three changes to Chat in
-- one migration, because the client that uses them lands as one step and the
-- database has to be ready before any of it.
--
-- Two of Chat's recorded decisions are reopened here, at the owner's word.
-- 20260918030000 said joining a room is what buys the right to write in it;
-- 20260918060000 said there is no editing. Both were the owner's to make and
-- are now made the other way. The reasoning that stood behind each is left in
-- its own migration's header, because a migration is not edited after it has
-- run — but nothing below should be read as having forgotten it.
--
-- ---------------------------------------------------------------------------
-- 1. Writing needs no membership
-- ---------------------------------------------------------------------------
-- `chat_can_post_in` stops asking for a chat_room_members row. Active, and
-- either an administrator or the room exists and is open — that is the whole
-- gate now. `chat_file_is_writable` calls it, so uploading a photograph into
-- a room's folder follows without a change of its own.
--
-- chat_room_members and its policies stay. The rows are history,
-- chat_create_room still writes one for whoever starts a room, and the
-- probes that count them still count them. The client simply stops reading
-- the table: no Join, no Joined, no member count. `chat_room_stats` keeps its
-- member_count column so that an older client mid-deploy still finds the
-- shape it selects; nothing draws it any more.
--
-- The order of release depends on this being the *first* thing to change.
-- With this migration on the live database and the old client still
-- deployed, nothing breaks: the old client still offers Join, joining still
-- works, and the database simply no longer requires it. The other way round
-- — the new client on the old database — refuses every member who never
-- joined.
--
-- ---------------------------------------------------------------------------
-- 2. edited_at
-- ---------------------------------------------------------------------------
-- One column on chat_posts and one on chat_messages. Null until the first
-- edit; then the clock of the latest one, which is what "Edited · 9:30am"
-- prints. Not in the column-level insert grants, for the reason
-- 20260918110000 gives about created_at: a row that arrives already "edited"
-- is a row that lies, and RLS cannot take a granted column back.
--
-- ---------------------------------------------------------------------------
-- 3. reply_to
-- ---------------------------------------------------------------------------
-- A post may answer one other post in its topic, and a message one other
-- message in its thread. The column is granted for insert alongside the ones
-- already granted, so `sendPost` and `sendMessage` name it in the same
-- insert; a `before insert` trigger on each table is what keeps it honest.
--
-- **Posts nest one level and messages do not nest at all.** In a topic a
-- reply is drawn under the post it answers, indented, and a reply to a reply
-- is refused by the trigger — the client sets reply_to to the parent instead,
-- so a member never meets the refusal in ordinary use, and the trigger is
-- there for a second tab or an older build. In a conversation the same
-- column is drawn as a quote above the message, and the list stays in time
-- order: a nest in a chat would break the one thing a conversation is. So a
-- message may quote a message that itself quotes another, and the trigger
-- does not mind.
--
-- Both triggers refuse a parent in a different topic (or thread) and a parent
-- that has been removed, in one sentence for "not there" and "not here" so
-- that a guessed id learns nothing about a room it cannot read. The refusal
-- is `raise exception` with plpgsql's default code, which describeError
-- passes through as the sentence it is.
--
-- `on delete set null` on both: a real delete of the parent only happens when
-- an administrator deletes a whole topic, which takes the replies too, but
-- the foreign key has to say something and cascade would be the wrong thing
-- to say. What matters more is the *soft* removal: `chat_remove_post` now
-- nulls reply_to on the replies of a post it removes, so they stand as posts
-- in their own right, in their own time order, and nothing says "reply to a
-- removed post". Messages are left pointing at a removed message, because the
-- quote can say "Removed message" and a conversation reads better with the
-- gap acknowledged than with the quote silently gone.
--
-- ---------------------------------------------------------------------------
-- 4. chat_edits: every earlier version, for administrators only
-- ---------------------------------------------------------------------------
-- An edit copies what the post or message said before — words and
-- photograph paths — into chat_edits, then overwrites the row. So the row is
-- always the latest and the table is always the history, one row per edit.
--
-- One select policy, `is_admin()`, and select granted to `authenticated`;
-- nothing else, to anybody. A member cannot read their own earlier versions
-- back, deliberately: the reason to keep them is moderation, and a member who
-- wants their old words has the composer in front of them. The two definer
-- functions below are the only writers.
--
-- Exactly one of post_id and message_id is set. chat_reports could not say
-- that as a check because its foreign keys are SET NULL and a deleted post
-- would leave a report that violates it; chat_edits' foreign keys *cascade*,
-- so an edit goes with its post and the check is safe — the same shape as
-- chat_removed_bodies.
--
-- admin_post_edits() and admin_message_edits() are **not** written and should
-- not be: an administrator selects chat_edits directly, and the policy is the
-- gate. A function would be a second gate to keep in step with the first.
--
-- ---------------------------------------------------------------------------
-- 5 and 6. chat_edit_post and chat_edit_message
-- ---------------------------------------------------------------------------
-- Definer, because they write chat_edits, which nobody may write, and update
-- two columns members have no update grant on. Every gate is stated inside,
-- as every definer function in Chat states its own:
--
--  - the caller is an active member, the author, and the row is standing.
--    **An administrator is refused like anybody else.** An administrator
--    removes; rewriting a member's words in that member's name is not
--    moderation, and there is no version of it that reads as anything but.
--  - a post's room is readable and open; a message's thread has the caller
--    on its roster.
--  - the new body is trimmed, at most 4,000 characters, and not blank unless
--    the row has photographs — the row's own check, said in a sentence
--    before the write rather than as a constraint name after it.
--  - an edit that changes nothing is refused, so "Edited" is never a lie.
--
-- Photographs are not changed by an edit. Take the post back and post again
-- for that; the composer's edit mode does not offer the picker.
--
-- ---------------------------------------------------------------------------
-- 7. Notifications and realtime: nothing to add
-- ---------------------------------------------------------------------------
-- An edit is an `update`, and the push triggers fire on `insert`. A reply is
-- an ordinary post or message and notifies as one already does — the topic's
-- starter and participants, or the thread's members. Both tables are already
-- in the realtime publication, and an edit arrives on the wire as the same
-- `update` a removal does, so every open screen redraws without a new
-- subscription.
-- ============================================================================

-- ------------------------------------------------ 1. writing needs no membership
create or replace function public.chat_can_post_in(room text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_active_member()
     and (
       -- An administrator seeds a room before anybody can see it, so no open
       -- room is required of them. Nobody is required to have joined: the
       -- owner's decision, 2026-09-29.
       public.is_admin()
       or exists (
         select 1 from public.chat_rooms r
         where r.id = room and r.opened_at is not null
       )
     );
$$;

comment on function public.chat_can_post_in(text) is
  'May the caller start a topic or post in this room: an active member and the room is open — or an administrator. No membership row since 20260930000000.';

-- ----------------------------------------------------------------- 2. edited_at
alter table public.chat_posts
  add column if not exists edited_at timestamptz;
alter table public.chat_messages
  add column if not exists edited_at timestamptz;

comment on column public.chat_posts.edited_at is
  'When the author last edited it, or null. Written only by chat_edit_post().';
comment on column public.chat_messages.edited_at is
  'When the author last edited it, or null. Written only by chat_edit_message().';

-- ------------------------------------------------------------------ 3. reply_to
alter table public.chat_posts
  add column if not exists reply_to uuid references public.chat_posts (id) on delete set null;
alter table public.chat_messages
  add column if not exists reply_to uuid references public.chat_messages (id) on delete set null;

comment on column public.chat_posts.reply_to is
  'The post this one answers, in the same topic, one level deep. Nulled when that post is removed.';
comment on column public.chat_messages.reply_to is
  'The message this one answers, in the same thread, drawn as a quote. Kept when that message is removed.';

create index if not exists chat_posts_reply_to_idx
  on public.chat_posts (reply_to) where reply_to is not null;
create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to) where reply_to is not null;

grant insert (reply_to) on public.chat_posts to authenticated;
grant insert (reply_to) on public.chat_messages to authenticated;

-- Definer, so that the parent can be read whatever the caller's policies say
-- about it. The two questions it asks are about the parent's own row, and the
-- one sentence for both "not there" and "not in this topic" is deliberate —
-- see the header.
create or replace function public.chat_check_post_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.chat_posts;
begin
  if new.reply_to is null then
    return new;
  end if;

  select * into parent from public.chat_posts p where p.id = new.reply_to;
  if not found or parent.topic_id is distinct from new.topic_id then
    raise exception 'The post you are replying to is not in this topic.';
  end if;
  if parent.removed_at is not null then
    raise exception 'The post you are replying to has been removed.';
  end if;
  -- One level. The client sets reply_to to the parent's parent before it gets
  -- here; this is for a second tab or an older build.
  if parent.reply_to is not null then
    raise exception 'A reply goes under the post, not under another reply.';
  end if;

  return new;
end;
$$;

comment on function public.chat_check_post_reply() is
  'Before a post lands: its reply_to names a standing, top-level post in the same topic, or nothing.';

revoke all on function public.chat_check_post_reply() from public, anon, authenticated;

drop trigger if exists chat_posts_check_reply on public.chat_posts;
create trigger chat_posts_check_reply
  before insert on public.chat_posts
  for each row execute function public.chat_check_post_reply();

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

  return new;
end;
$$;

comment on function public.chat_check_message_reply() is
  'Before a message lands: its reply_to names a standing message in the same thread, or nothing.';

revoke all on function public.chat_check_message_reply() from public, anon, authenticated;

drop trigger if exists chat_messages_check_reply on public.chat_messages;
create trigger chat_messages_check_reply
  before insert on public.chat_messages
  for each row execute function public.chat_check_message_reply();

-- ----------------------------------------------------------------- 4. chat_edits
create table if not exists public.chat_edits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.chat_posts (id) on delete cascade,
  message_id uuid references public.chat_messages (id) on delete cascade,
  -- What the row said before this edit replaced it.
  body text not null,
  attachments text[] not null default '{}',
  edited_by uuid references public.members (id) on delete set null,
  -- clock_timestamp(), not now(): two edits in one transaction are still two
  -- versions in order. See 20260918070000 on chat_messages.created_at.
  replaced_at timestamptz not null default clock_timestamp(),
  -- Exactly one. Safe as a check because both foreign keys cascade — see the
  -- header on why chat_reports could not do the same.
  constraint chat_edits_one_source check ((post_id is not null) <> (message_id is not null))
);

comment on table public.chat_edits is
  'Every earlier version of an edited post or message. Administrators read it; the two edit functions write it; nobody else touches it.';

create index if not exists chat_edits_post_idx on public.chat_edits (post_id, replaced_at);
create index if not exists chat_edits_message_idx on public.chat_edits (message_id, replaced_at);

alter table public.chat_edits enable row level security;

drop policy if exists "an administrator reads every earlier version" on public.chat_edits;
create policy "an administrator reads every earlier version"
  on public.chat_edits for select
  using (public.is_admin());

-- `authenticated` is named — see 20260918020000's header. Select and nothing
-- else: the policy above is the gate, and there is no insert, update or
-- delete for anybody, so an ungranted verb refuses rather than no-ops.
revoke all on public.chat_edits from anon, authenticated, public;
grant select on public.chat_edits to authenticated;

-- ------------------------------------------------------------ 5. chat_edit_post
create or replace function public.chat_edit_post(post uuid, new_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
  clean text := btrim(coalesce(new_body, ''));
begin
  -- Definer, so RLS is off in here and nothing above has checked anything.
  if not public.is_active_member() then
    raise exception 'Only an active member can edit a post.' using errcode = '42501';
  end if;

  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  -- Read gate first, in the same sentence as "not there": a post in a room
  -- the caller cannot read is, to them, not there.
  if not exists (
    select 1 from public.chat_topics t
    where t.id = target.topic_id and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  -- The author, and nobody else — an administrator included. See the header.
  if target.author_id is distinct from auth.uid() then
    raise exception 'You can only edit your own post.' using errcode = '42501';
  end if;

  if target.removed_at is not null then
    raise exception 'That post has been removed.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_topics t
    join public.chat_rooms r on r.id = t.room_id
    where t.id = target.topic_id and r.opened_at is not null
  ) then
    raise exception 'This room is closed.' using errcode = '42501';
  end if;

  -- The row's own check, said before the write.
  if char_length(clean) > 4000 then
    raise exception 'A post is at most 4,000 characters.' using errcode = '22023';
  end if;
  if clean = '' and cardinality(target.attachments) = 0 then
    raise exception 'A post needs some words or a photograph.' using errcode = '22023';
  end if;

  -- So that "Edited" is never a lie.
  if clean = target.body then
    raise exception 'Nothing changed.' using errcode = '22023';
  end if;

  insert into public.chat_edits (post_id, body, attachments, edited_by)
  values (target.id, target.body, target.attachments, auth.uid());

  update public.chat_posts
     set body = clean,
         edited_at = clock_timestamp()
   where id = target.id;
end;
$$;

comment on function public.chat_edit_post(uuid, text) is
  'The author changes the words of their own standing post. The earlier version goes to chat_edits.';

revoke all on function public.chat_edit_post(uuid, text) from public, anon;
grant execute on function public.chat_edit_post(uuid, text) to authenticated;

-- --------------------------------------------------------- 6. chat_edit_message
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

  -- Not is_admin() as an alternative: an administrator is not in a
  -- conversation they are not on the roster of, and could not edit a message
  -- there anyway, since it is not theirs.
  if not public.is_thread_member(target.thread_id) then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() then
    raise exception 'You can only edit your own message.' using errcode = '42501';
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

comment on function public.chat_edit_message(uuid, text) is
  'The author changes the words of their own standing message. The earlier version goes to chat_edits.';

revoke all on function public.chat_edit_message(uuid, text) from public, anon;
grant execute on function public.chat_edit_message(uuid, text) to authenticated;

-- ------------------------------------------ removing a post frees its replies
-- As 20260927030000, plus one update: the replies of a removed post become
-- posts in their own right. See "3. reply_to" in the header.
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

  -- Its replies stand, as posts of their own. Nothing says "reply to a
  -- removed post".
  update public.chat_posts
     set reply_to = null
   where reply_to = target.id;

  update public.chat_topics t
     set reply_count = public.chat_topic_reply_count(target.topic_id)
   where t.id = target.topic_id;
end;
$$;
