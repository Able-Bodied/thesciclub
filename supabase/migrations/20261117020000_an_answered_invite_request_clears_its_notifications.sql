-- ============================================================================
-- An answered invite request clears its notifications (the owner, 2026-11-16)
-- ============================================================================
-- A request reaches every org admin on the desk (20261112130000), and the
-- first to answer takes it. The owner tapped "Randall Collins asked you for an
-- invite" after another org admin had already sent it, and Invites had nothing
-- to show. The owner: "just clear notifications for requested invites that
-- have already been addressed".
--
-- Each org admin has one invite_request notification per organization (tag
-- 'invite_request:<organization>'), counting its requests. When a request is
-- answered, by anybody and from anywhere (the web, an older iPhone app):
--   * none left open for that organization: its invite_request notifications
--     are deleted, for everybody;
--   * some still open: an unread one counts only those, and names the latest.
-- A trigger, not a change to answer_invite_request, so every way of answering
-- is covered. No column or function an older app calls is changed.
--
-- Then, once, the same for requests already answered (Randall's among them).
-- ============================================================================

create or replace function private.invite_request_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  waiting integer;
  latest text;
begin
  select count(*), (array_agg(q.name order by q.created_at desc))[1]
    into waiting, latest
    from public.invite_requests q
   where q.organization_id = new.organization_id and q.status = 'open';

  if waiting = 0 then
    delete from public.notifications n
     where n.kind = 'invite_request'
       and n.tag = 'invite_request:' || new.organization_id::text;
  else
    update public.notifications n
       set count = least(n.count, waiting), detail = left(latest, 40)
     where n.kind = 'invite_request'
       and n.tag = 'invite_request:' || new.organization_id::text
       and n.read_at is null;
  end if;
  return null;
end;
$$;

revoke all on function private.invite_request_answered() from public;

drop trigger if exists invite_request_answered on public.invite_requests;
create trigger invite_request_answered
  after update of status on public.invite_requests
  for each row
  when (old.status = 'open' and new.status <> 'open')
  execute function private.invite_request_answered();

-- Those already answered.
delete from public.notifications n
 where n.kind = 'invite_request'
   and not exists (
     select 1 from public.invite_requests q
      where q.status = 'open' and n.tag = 'invite_request:' || q.organization_id::text
   );
