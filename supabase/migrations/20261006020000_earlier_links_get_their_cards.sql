-- ============================================================================
-- Links sent before previews were switched on get their cards too
-- ============================================================================
-- The owner, 2026-10-06: links already in the club should show their picture
-- and title, not only the ones written after link previews go live. The
-- trigger (20261006010000) asks for a preview when words are written or
-- edited, so nothing written earlier would ever be asked about.
--
-- `link_preview_backfill()` asks once for every standing message and post
-- that has a link and no card: the same request the trigger sends, through
-- the same function, which writes nothing if the words have changed since.
-- Run it from the SQL editor after the switch (`link_preview_url`) is set:
--
--   select public.link_preview_backfill();
--
-- It answers how many requests were queued, not how many cards are saved:
-- pg_net sends them after this transaction commits. Wait for those requests
-- to finish before running it again. A row already previewed, a message
-- taken back, and words with no link are left alone; a later run retries
-- only links still without a card, including a page that gave nothing.
--
-- The club's history is small: a few dozen links. pg_net sends the requests
-- in batches, and the function fetches each page once.
--
-- The request itself moves into `link_preview_request`, so the trigger and
-- this send exactly the same thing.
-- ============================================================================

-- One request to the function for one row. False when the switch is off.
create or replace function public.link_preview_request(p_table text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'link_preview_url';
  if target is null or target = '' then
    return false;
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'link_preview_secret';

  perform net.http_post(
    url := target,
    body := jsonb_build_object('table', p_table, 'id', p_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-preview-secret', secret
    ),
    timeout_milliseconds := 20000
  );
  return true;
end;
$$;

revoke all on function public.link_preview_request(text, uuid) from public, anon, authenticated;

-- The trigger, as before, through the shared request.
create or replace function public.link_preview_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is not null or new.body !~* '(https?://|www\.)' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then
    return null;
  end if;
  perform public.link_preview_request(tg_table_name, new.id);
  return null;
exception when others then
  -- A message must never fail for its preview.
  raise warning 'link_preview_enqueue: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.link_preview_enqueue() from public, anon, authenticated;

-- ---------------------------------------------------------------- backfill
create or replace function public.link_preview_backfill()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  waiting record;
  asked integer := 0;
begin
  if not exists (
    select 1 from vault.decrypted_secrets s
     where s.name = 'link_preview_url' and coalesce(s.decrypted_secret, '') <> ''
  ) then
    raise exception 'Link previews are switched off: set link_preview_url first.'
      using errcode = '55000';
  end if;

  for waiting in
    select 'chat_messages' as from_table, m.id
      from public.chat_messages m
     where m.removed_at is null and m.link_preview is null
       and m.body ~* '(https?://|www\.)'
    union all
    select 'chat_posts', p.id
      from public.chat_posts p
     where p.removed_at is null and p.link_preview is null
       and p.body ~* '(https?://|www\.)'
  loop
    if public.link_preview_request(waiting.from_table, waiting.id) then
      asked := asked + 1;
    end if;
  end loop;
  return asked;
end;
$$;

comment on function public.link_preview_backfill() is
  'Asks the link-preview function about every standing message and post with a link and no card. Run once from the SQL editor after link_preview_url is set.';

revoke all on function public.link_preview_backfill() from public, anon, authenticated;
grant execute on function public.link_preview_backfill() to service_role;
