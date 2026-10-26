-- ============================================================================
-- Notifications in the store app: an iPhone's device token
-- ============================================================================
-- The store app cannot use web push (no service worker), so it asks iOS for
-- an APNs device token instead, and push-notify sends to Apple directly.
--
-- The token goes in push_subscriptions, as one more kind of endpoint:
--
--   apns:<production|sandbox>:<token in lowercase hex>
--
-- so everything that already decides who is told — push_owed's blocks,
-- mutes, switches and paused members, push_forget, the cascade when an account
-- is deleted or removed, the Stats count — covers the app with no line
-- changed. The environment is part of the address: a token from a TestFlight
-- or App Store build is only good at api.push.apple.com, one from a
-- development build only at the sandbox. A future Android token would be
-- `fcm:<token>`, with its own sender in push-notify.
--
-- An app row has no p256dh or auth; a browser's still must have both.
--
-- Written only by push_subscribe_app, which takes the token over from whoever
-- held it, as push_subscribe does for a browser (20260927000000): the token is
-- a capability that only that iPhone's registration hands out. A member keeps
-- at most ten app tokens, the newest: anything more would only be made-up
-- tokens, each one more request to Apple under the club's key.
-- ============================================================================

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_check,
  drop constraint if exists push_subscriptions_keys_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_check check (
    (
      endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|google\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'
      and length(endpoint) <= 1024
    )
    or endpoint ~ '^apns:(production|sandbox):[0-9a-f]{64,200}$'
  ),
  -- Spelled out with "is not null": a check that comes out null passes.
  add constraint push_subscriptions_keys_check check (
    case
      when endpoint like 'apns:%' then p256dh is null and auth is null
      else p256dh is not null and auth is not null
        and p256dh ~ '^[A-Za-z0-9_-]+=*$' and length(p256dh) between 80 and 100
        and auth ~ '^[A-Za-z0-9_-]+=*$' and length(auth) between 16 and 32
    end
  );

comment on table public.push_subscriptions is
  'One row per device a member has turned notifications on for: a browser''s push endpoint, or the store app''s apns:<environment>:<token>. Written only by push_subscribe and push_subscribe_app; private to that member.';

-- ------------------------------------------------------------ subscribing --
create or replace function public.push_subscribe_app(
  app_token text,
  app_environment text,
  app_user_agent text default null
)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  device text;
begin
  if not public.is_active_member() then
    raise exception 'Notifications cannot be turned on while your membership is paused.';
  end if;

  if app_environment is null or app_environment not in ('production', 'sandbox')
     or app_token is null or lower(app_token) !~ '^[0-9a-f]{64,200}$' then
    raise exception 'This iPhone sent a token the club could not use.';
  end if;

  device := 'apns:' || app_environment || ':' || lower(app_token);

  -- Whoever held this iPhone before, it is the caller's now.
  delete from public.push_subscriptions where endpoint = device;

  insert into public.push_subscriptions (endpoint, member_id, p256dh, auth, user_agent, created_at)
  values (device, auth.uid(), null, null, left(app_user_agent, 512), clock_timestamp());

  delete from public.push_subscriptions s
   where s.member_id = auth.uid()
     and s.endpoint like 'apns:%'
     and s.endpoint not in (
       select k.endpoint from public.push_subscriptions k
        where k.member_id = auth.uid() and k.endpoint like 'apns:%'
        order by k.created_at desc, k.endpoint
        limit 10
     );
end;
$$;

comment on function public.push_subscribe_app(text, text, text) is
  'Turn notifications on for this iPhone in the store app, taking its token over from whoever held it before.';

revoke all on function public.push_subscribe_app(text, text, text) from public, anon;
grant execute on function public.push_subscribe_app(text, text, text) to authenticated, service_role;
