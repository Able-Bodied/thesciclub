-- ============================================================================
-- The speed limit holds for messages and posts sent at the same moment
-- ============================================================================
-- 20261112020000 counts a member's rows of the last minute before each insert.
-- Inserts running side by side could not see each other's uncommitted rows,
-- so each counted fewer than the cap: the nightly load-test robots got 38 of
-- 45 messages sent at once past the limit of 30 (2026-11-12).
--
-- Now each insert first takes a lock for that member and table, held until
-- its transaction ends, so the next one counts after it. Only one member's
-- own writes wait on each other; nobody else's do. Same lock as
-- create_my_invite's (20261018030000).
-- ============================================================================

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
  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    return new;
  end if;
  -- Nested, not "and": a post has no notice field, and plpgsql may read both sides.
  if tg_table_name = 'chat_messages' then
    if new.notice is not null then
      return new;
    end if;
  end if;
  -- One at a time per member and table: the count below then sees the rows
  -- of any insert that got here first.
  perform pg_advisory_xact_lock(hashtext('chat_speed_limit ' || tg_table_name), hashtext(new.author_id::text));
  if tg_table_name = 'chat_messages' then
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
