-- ============================================================================
-- Chat, migration 10: taking a message back
-- ============================================================================
-- The twin of chat_remove_post (migration 6), for threads. An author can remove
-- their own message; an administrator can remove anybody's. No reporting, no
-- blocking, no editing, no control drawn for any of them.
--
-- ---------------------------------------------------------------------------
-- One table for what was said and removed, not two
-- ---------------------------------------------------------------------------
-- CHAT-PLAN.md offered "a nullable message_id on chat_removed_bodies, or a twin
-- of it". This is the first. The fact being kept is the same fact — the words,
-- who removed them, when — and an administrator looking into a complaint should
-- not have to know whether it happened in a room or in a conversation to find
-- them.
--
-- That costs this migration the table's shape: `post_id` was the primary key and
-- is now one of two nullable columns with exactly one of them set. The surrogate
-- key is added rather than making (post_id, message_id) the key, because a
-- primary key with a null in it is not one.
--
-- The table keeps what it had: RLS on, no policy, no grant to anon or
-- authenticated. Reachable from a database session and from nowhere else, which
-- is the right amount of friction for something read once a year — and the
-- reason a removed body can be blanked in place rather than hidden behind a
-- view. See 20260918060000's header, and the realtime note: a view is a curtain,
-- because every member who can read a message can subscribe to the table.
--
-- ---------------------------------------------------------------------------
-- An administrator can remove a message they cannot read
-- ---------------------------------------------------------------------------
-- And that is the one place this differs from chat_remove_post, which checks
-- chat_room_is_readable() first. It cannot check the equivalent here, because
-- the equivalent is is_thread_member() and an administrator is not in somebody
-- else's conversation — a private thread they could read would not be private.
--
-- So the read gate is: on the roster, **or** an administrator. Which means an
-- administrator acting on a complaint removes the message by its id, having
-- been shown it by the person complaining, without the club's messages becoming
-- readable by whoever is administering it. The words go to chat_removed_bodies
-- as they do for a post, so the decision is auditable by a database session
-- afterwards.
--
-- Everything else is migration 6's: soft delete so the row stays,
-- `removed_by_admin` derived from whether the remover wrote it rather than
-- trusted from a parameter, and idempotent so that two taps on a slow
-- connection do not rewrite who removed it or overwrite the stored body with
-- the blank that replaced it.
-- ============================================================================

-- ------------------------------------------------- the kept-bodies table, again
-- It has always had exactly one row per removed post, so there is nothing to
-- back-fill; post_id simply stops being the key.
alter table public.chat_removed_bodies
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.chat_removed_bodies
  drop constraint if exists chat_removed_bodies_pkey;

alter table public.chat_removed_bodies
  add constraint chat_removed_bodies_pkey primary key (id);

alter table public.chat_removed_bodies
  alter column post_id drop not null;

alter table public.chat_removed_bodies
  add column if not exists message_id uuid references public.chat_messages (id) on delete cascade;

-- A plain unique constraint, which in Postgres admits any number of nulls and
-- so means "at most one row per post" and "at most one per message" without a
-- partial index for each.
alter table public.chat_removed_bodies
  drop constraint if exists chat_removed_bodies_post_id_key;
alter table public.chat_removed_bodies
  add constraint chat_removed_bodies_post_id_key unique (post_id);
alter table public.chat_removed_bodies
  drop constraint if exists chat_removed_bodies_message_id_key;
alter table public.chat_removed_bodies
  add constraint chat_removed_bodies_message_id_key unique (message_id);

-- Exactly one of the two. A row with neither is words belonging to nothing, and
-- a row with both is one removal recorded as two.
alter table public.chat_removed_bodies
  drop constraint if exists chat_removed_bodies_one_source;
alter table public.chat_removed_bodies
  add constraint chat_removed_bodies_one_source
  check ((post_id is not null) <> (message_id is not null));

comment on table public.chat_removed_bodies is
  'What a removed post or message said. RLS on with no policy and no grant: reachable from a database session and nowhere else.';

-- Unchanged, and restated because this migration touched the table: no policy,
-- and no grant to anybody. The only writers are chat_remove_post() and
-- chat_remove_message(), both definer.
revoke all on public.chat_removed_bodies from anon, authenticated, public;

-- ------------------------------------------------------------------- removal
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

  -- Definer, so RLS is off and nothing above has checked that the caller can
  -- see this thread. An administrator is not on the roster and must not have to
  -- be — see the header.
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

  insert into public.chat_removed_bodies (message_id, body, removed_by)
  values (target.id, target.body, auth.uid())
  on conflict (message_id) do nothing;

  update public.chat_messages
     set body = '',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;
end;
$$;

comment on function public.chat_remove_message(uuid) is
  'Remove a message: blank its body, keep its row. The author, or an administrator acting on a complaint.';

revoke all on function public.chat_remove_message(uuid) from public, anon;
grant execute on function public.chat_remove_message(uuid) to authenticated;
