-- Where to send a notification: one row per device that has said yes.
--
-- The second piece of notifications (HANDOFF.md, "Next up: notifications on
-- an iPhone"). The service worker can already show one; this is where a
-- member's phone leaves the address a push is sent to. Nothing sends yet —
-- that is the Edge Function, and it reads this table with the service role.
--
-- ---------------------------------------------------------------------------
-- A subscription belongs to a device, and a device changes hands
-- ---------------------------------------------------------------------------
-- The endpoint is the browser's, not the member's. Sign out of the installed
-- app and sign in as somebody else, and the browser hands back the same
-- endpoint. With a plain unique constraint the second member's insert is
-- refused — they cannot see the first member's row to delete it — and worse,
-- the first member's row stays, so *their* messages keep arriving on a phone
-- somebody else is now holding.
--
-- So a subscription is written by `push_subscribe`, a definer function that
-- takes the endpoint over: whoever holds the device now is who it notifies.
-- That is safe because the endpoint is a capability. It is an unguessable URL
-- the push service minted for that browser, and nobody can read another
-- member's; the only way to present it is to be on that device.
--
-- Signing out should delete the row as well, and the client does. This
-- function is for the time it did not — a flat battery, a cleared session.
--
-- ---------------------------------------------------------------------------
-- Insert and delete, never update, and so never an upsert
-- ---------------------------------------------------------------------------
-- The join-a-room bug (HANDOFF.md, "What will bite the next person"): an
-- upsert is `on conflict do update`, which needs an update grant. There is no
-- insert grant on this table at all — the function is the only way in — and
-- no update grant, because nothing about a subscription changes: a new key is
-- a new subscription and arrives with a new endpoint.
--
-- ---------------------------------------------------------------------------
-- The endpoint must be a push service's
-- ---------------------------------------------------------------------------
-- The sender will POST to whatever URL is in this column, from inside our
-- infrastructure. Accept any https URL and a member can make the Edge Function
-- fetch an address of their choosing on every message they are sent. So the
-- host must be one of the four push services browsers actually use: Apple's
-- (the club's phones), Google's (Chrome and Android), Mozilla's, and
-- Microsoft's (Edge). A browser that uses another is refused with a sentence,
-- and adding it is one alternative in the pattern below — in both places.
--
-- ---------------------------------------------------------------------------
-- Paused members cannot subscribe, and can unsubscribe
-- ---------------------------------------------------------------------------
-- The split organization_follows and event_rsvps make. The sender will skip a
-- paused member anyway; refusing the row as well means turning notifications
-- on while paused says so, rather than appearing to work.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint push_subscriptions_endpoint_check check (
    endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'
    and length(endpoint) <= 1024
  ),
  -- The keys are base64url. p256dh is a 65-byte point (87 characters), auth a
  -- 16-byte secret (22); the bounds are loose because padding varies.
  constraint push_subscriptions_keys_check check (
    p256dh ~ '^[A-Za-z0-9_-]+=*$' and length(p256dh) between 80 and 100
    and auth ~ '^[A-Za-z0-9_-]+=*$' and length(auth) between 16 and 32
  ),
  constraint push_subscriptions_user_agent_check check (length(user_agent) <= 512)
);

-- What the sender asks for every message: "this member's devices".
create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (member_id);

comment on table public.push_subscriptions is
  'One row per device a member has turned notifications on for. Written only by push_subscribe; private to that member.';

alter table public.push_subscriptions enable row level security;

drop policy if exists "members read their own subscriptions" on public.push_subscriptions;
create policy "members read their own subscriptions"
  on public.push_subscriptions for select
  using (member_id = auth.uid());

-- Deliberately not gated on active membership: somebody paused can still turn
-- notifications off.
drop policy if exists "members remove their own subscriptions" on public.push_subscriptions;
create policy "members remove their own subscriptions"
  on public.push_subscriptions for delete
  using (member_id = auth.uid());

revoke all on public.push_subscriptions from anon, authenticated, public;
grant select, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------- subscribing
-- Parameters are prefixed because a plpgsql parameter named after a column is
-- ambiguous inside the function (HANDOFF.md has three of those).
create or replace function public.push_subscribe(
  sub_endpoint text,
  sub_p256dh text,
  sub_auth text,
  sub_user_agent text default null
)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Notifications cannot be turned on while your membership is paused.';
  end if;

  if sub_endpoint is null
     or sub_endpoint !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/' then
    raise exception 'This browser cannot receive the club''s notifications. Add the club to your Home Screen and try from there.';
  end if;

  -- Whoever held this device before, it is the caller's now. See the header.
  delete from public.push_subscriptions where endpoint = sub_endpoint;

  insert into public.push_subscriptions (endpoint, member_id, p256dh, auth, user_agent)
  values (sub_endpoint, auth.uid(), sub_p256dh, sub_auth, left(sub_user_agent, 512));
end;
$$;

comment on function public.push_subscribe(text, text, text, text) is
  'Turn notifications on for this device, taking the endpoint over from whoever held it before.';

revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
