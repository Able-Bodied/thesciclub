-- ============================================================================
-- A post shared into a conversation
-- ============================================================================
-- The owner, 2026-10-25: "Add the options to share posts in group chats and
-- DMs." A message can point at one post in a room (shared_post_id), drawn as
-- a card under its words. The message holds only the reference: the card is
-- read live, through chat_shared_posts(), with the reader's own rights, so
-- sharing never widens who can read a post.
--
-- A reader gets no card for a post in a room they cannot read (a closed
-- one), a post removed or deleted, or one whose author or topic starter they
-- blocked or who blocked them. The screen then says the post isn't
-- available, and nothing of it reaches the reader.
--
-- Who can share where is the messages' own rule: only into a conversation
-- you are in (the insert policy), and never in a direct conversation with a
-- blocked pair (chat_refuse_blocked_message, 20261022070000). On top of
-- that, a member shares only a post the card would show them.
--
-- No foreign key: a topic an administrator deletes takes its posts with it,
-- and the message should still say a post was shared and is gone.
-- ============================================================================

alter table public.chat_messages add column shared_post_id uuid;

-- As before, with a shared post standing in for words. A notice shares nothing.
alter table public.chat_messages drop constraint chat_messages_check;
alter table public.chat_messages add constraint chat_messages_check check (
  char_length(body) <= 4000
  and (removed_at is not null or notice is not null or char_length(btrim(body)) > 0
       or cardinality(attachments) > 0 or shared_post_id is not null)
);
alter table public.chat_messages add constraint chat_messages_shared_not_notice
  check (shared_post_id is null or notice is null);

create index chat_messages_shared_post_idx on public.chat_messages (shared_post_id)
  where shared_post_id is not null;

-- Select is granted on the table already (20261020000000); insert is by column.
grant insert (shared_post_id) on public.chat_messages to authenticated;

-- ------------------------------------------------------------------ helper --
-- Whether the caller may see this post: what the topics' and posts' select
-- policies allow (a readable room, the post standing), and no block between
-- the caller and its author or its topic's starter, either way. Not granted:
-- a member could otherwise ask it about any post to find who blocked them.
create function public.chat_can_see_shared_post(post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.chat_posts p
      join public.chat_topics t on t.id = p.topic_id
     where p.id = post
       and p.removed_at is null
       and public.chat_room_is_readable(t.room_id)
       and not public.members_blocked(auth.uid(), p.author_id)
       and not public.members_blocked(auth.uid(), t.author_id)
  );
$$;
revoke all on function public.chat_can_see_shared_post(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------- sharing --
-- The sender must be able to see what they share. Update too, though no
-- member can update a message directly, so nothing later swaps the post.
create function public.chat_check_shared_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shared_post_id is not null
     and (tg_op = 'INSERT' or new.shared_post_id is distinct from old.shared_post_id)
     and not public.chat_can_see_shared_post(new.shared_post_id) then
    raise exception 'That post can''t be shared.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.chat_check_shared_post() from public, anon, authenticated;

create trigger chat_messages_check_shared
  before insert or update of shared_post_id on public.chat_messages
  for each row execute function public.chat_check_shared_post();

-- -------------------------------------------------------------------- card --
-- The cards for messages the caller can read. Definer, so every check is
-- here: the caller is in the conversation, the message stands and is not by
-- somebody they blocked, and chat_can_see_shared_post. A message whose post
-- fails any of it returns no row, and the screen says it isn't available.
-- Only the start of the words, and the first photograph's path, which
-- storage signs only for a reader of that room.
create function public.chat_shared_posts(message_ids uuid[])
returns table (
  message_id uuid,
  post_id uuid,
  topic_id uuid,
  room_id text,
  room_name text,
  topic_title text,
  opening boolean,
  author_id uuid,
  body text,
  photo_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, p.id, t.id, r.id, r.name, t.title,
         p.id = (
           select o.id from public.chat_posts o
            where o.topic_id = t.id
            order by o.created_at, o.id
            limit 1
         ),
         p.author_id, left(p.body, 400), p.attachments[1], p.created_at
    from public.chat_messages m
    join public.chat_posts p on p.id = m.shared_post_id
    join public.chat_topics t on t.id = p.topic_id
    join public.chat_rooms r on r.id = t.room_id
   where m.id = any (message_ids)
     and m.removed_at is null
     and public.is_thread_member(m.thread_id)
     and not coalesce(m.author_id = any (public.my_blocked_member_ids()), false)
     and public.chat_can_see_shared_post(p.id);
$$;
revoke all on function public.chat_shared_posts(uuid[]) from public, anon, authenticated;
grant execute on function public.chat_shared_posts(uuid[]) to authenticated;

-- ------------------------------------------------------------------- edits --
-- As 20260930020000: a shared post counts as content, so its
-- line can be cleared and the card stays.
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
  if clean = '' and cardinality(target.attachments) = 0 and target.shared_post_id is null then
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

-- ----------------------------------------------------------------- reports --
-- As 20260930020000, saying in the copy that a post was shared.
-- The post itself is not copied: it has its own Report, and the reference
-- stays on the message.
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
       when 'pictured' then 'Changed the group’s picture'
       when 'unpictured' then 'Took the group’s picture away'
       else case
         when target.shared_post_id is null then target.body
         when btrim(target.body) = '' then '(Shared a post)'
         else left(target.body, 3983) || E'\n\n(Shared a post)'
       end
     end,
     target.attachments, target.created_at,
     -- A group is named; a pair is not.
     case when thread.kind = 'group' then thread.name else 'A direct conversation' end,
     nullif(btrim(coalesce(report_note, '')), ''))
  on conflict (reporter_id, message_id) do nothing;
end;
$$;
