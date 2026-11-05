-- Undo for 20261105040000_reactions_say_where_they_are.sql: reactions without
-- their conversation or topic, and chat_threads back in supabase_realtime.
-- Ship the app that subscribes without the filters first.

drop trigger if exists chat_message_reactions_say_where on public.chat_message_reactions;
drop trigger if exists chat_post_reactions_say_where on public.chat_post_reactions;
drop function if exists public.chat_reaction_says_where();

alter table public.chat_message_reactions drop column if exists thread_id;
alter table public.chat_post_reactions drop column if exists topic_id;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_threads'
  ) then
    alter publication supabase_realtime add table public.chat_threads;
  end if;
end;
$$;
