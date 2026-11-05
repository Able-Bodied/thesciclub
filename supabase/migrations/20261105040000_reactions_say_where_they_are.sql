-- ============================================================================
-- A reaction says which conversation or topic it is in; chat_threads leaves
-- Realtime
-- ============================================================================
-- Free-plan load (report of 2026-11-05, fix 5). An open conversation or topic
-- subscribed to every reaction in the club, so Realtime ran the read rule for
-- every open screen on every reaction anywhere. With the conversation or the
-- topic on the row, a screen subscribes with thread_id=eq. or topic_id=eq.,
-- and only its own reactions reach the rule. RLS is unchanged and is still
-- what makes a subscription safe; the filter only narrows it.
--
-- A trigger fills the column from the message or post, on insert and on every
-- update, so it cannot be pointed elsewhere. A message never changes
-- conversation, and a post never changes topic (a moved topic keeps its posts).
--
-- chat_threads leaves supabase_realtime: nothing has ever subscribed to it,
-- and every message updates its row (chat_bump_thread).
--
-- Deploy before the app that filters on these columns. Undo:
-- supabase/undo/20261105040000.sql. Probe: supabase/tests/reactions-say-where.sql.
-- ============================================================================

alter table public.chat_message_reactions add column if not exists thread_id uuid;
alter table public.chat_post_reactions add column if not exists topic_id uuid;

create or replace function public.chat_reaction_says_where()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'chat_message_reactions' then
    select m.thread_id into new.thread_id from public.chat_messages m where m.id = new.target_id;
  else
    select p.topic_id into new.topic_id from public.chat_posts p where p.id = new.target_id;
  end if;
  return new;
end;
$$;

revoke all on function public.chat_reaction_says_where() from public, anon, authenticated;

drop trigger if exists chat_message_reactions_say_where on public.chat_message_reactions;
create trigger chat_message_reactions_say_where
  before insert or update on public.chat_message_reactions
  for each row execute function public.chat_reaction_says_where();

drop trigger if exists chat_post_reactions_say_where on public.chat_post_reactions;
create trigger chat_post_reactions_say_where
  before insert or update on public.chat_post_reactions
  for each row execute function public.chat_reaction_says_where();

-- The rows already there. Only emoji changes notify, so this sends nothing.
update public.chat_message_reactions x set thread_id = m.thread_id
  from public.chat_messages m where m.id = x.target_id and x.thread_id is distinct from m.thread_id;
update public.chat_post_reactions x set topic_id = p.topic_id
  from public.chat_posts p where p.id = x.target_id and x.topic_id is distinct from p.topic_id;

alter table public.chat_message_reactions alter column thread_id set not null;
alter table public.chat_post_reactions alter column topic_id set not null;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_threads'
  ) then
    alter publication supabase_realtime drop table public.chat_threads;
  end if;
end;
$$;
