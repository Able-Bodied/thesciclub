-- Members can already read their conversation's roster and read markers.
-- Publish changes under those same RLS rules so receipts update without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_thread_members'
  ) then
    alter publication supabase_realtime add table public.chat_thread_members;
  end if;
end;
$$;
