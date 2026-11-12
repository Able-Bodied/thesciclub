-- A member can send 30 messages and 20 posts a minute, no more.
--
-- Nightly check rate_limits/messages (2026-11-11): 20 of 20 messages from one
-- member went through in a few seconds, as would 20,000. Only somebody
-- scripting the API reaches these numbers: one message every two seconds for
-- a whole minute is past any typist, and a message carries up to four photos.
-- Notices ("Added Sam to the group") are the database's own and not counted.
--
-- The refusal is HTTP 429 with code P0001, so the app (and the shipped
-- iPhone builds, through describeError) shows the sentence as it is.

create index chat_messages_author_time_idx
  on public.chat_messages (author_id, created_at) where author_id is not null;
drop index if exists public.chat_messages_author_id_idx;
create index chat_posts_author_time_idx
  on public.chat_posts (author_id, created_at) where author_id is not null;
drop index if exists public.chat_posts_author_id_idx;

create or replace function public.chat_speed_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  cap integer;
  what text;
begin
  -- Only a member's own writing: the server's, and notices, are not limited.
  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    return new;
  end if;
  if tg_table_name = 'chat_messages' then
    if new.notice is not null then
      return new;
    end if;
    cap := 30;
    what := 'messages';
    select count(*) into recent from public.chat_messages m
     where m.author_id = new.author_id and m.created_at > now() - interval '1 minute'
       and m.notice is null;
  else
    cap := 20;
    what := 'posts';
    select count(*) into recent from public.chat_posts p
     where p.author_id = new.author_id and p.created_at > now() - interval '1 minute';
  end if;
  if recent >= cap then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'P0001',
        'message', 'That is a lot of ' || what || ' in one minute. Wait a minute, then send it again.',
        'details', null, 'hint', null)::text,
      detail = json_build_object('status', 429, 'headers', json_build_object('Retry-After', '60'))::text;
  end if;
  return new;
end;
$$;

revoke all on function public.chat_speed_limit() from public, anon, authenticated;

create trigger chat_messages_speed_limit
  before insert on public.chat_messages
  for each row execute function public.chat_speed_limit();

create trigger chat_posts_speed_limit
  before insert on public.chat_posts
  for each row execute function public.chat_speed_limit();
