-- ============================================================================
-- The club knows who has the iPhone app
-- ============================================================================
-- The owner, 2026-11-15: "If a user is on iOS and the app is not installed it
-- should say install and not open on the nudge." A web page cannot see which
-- apps a phone has, and Safari answers a thesciclub:// link to an app that is
-- not there with "Safari cannot open the page". So the nudge offers Open in the
-- app only to a member the club knows has it, and Get the app to everybody
-- else (src/components/install-nudge.tsx).
--
-- The club knows from either of two things:
--
--   * an iPhone app's notification token (push_subscriptions, endpoint
--     apns:..., 20261023030000), which apps already on phones send once
--     notifications are on;
--   * the app saying so itself: signed in, it calls note_in_the_app() once a
--     launch (src/lib/sign-in-record.ts), from this release's build on.
--
-- Kept per member, not per phone: a member with the app on their iPhone is
-- most likely reading the site on that same iPhone. Somebody wrongly offered
-- Open still has "Not installed yet? Get it from the App Store" under it.
-- Somebody wrongly offered Get the app finds Open on the App Store page.
--
-- Only who and when; nothing about the phone. Goes with the account.
-- ============================================================================

create table if not exists private.app_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

comment on table private.app_seen is
  'When each member was last signed in on the iPhone app. Written by note_in_the_app, read by i_have_the_app. See 20261115130000.';

revoke all on private.app_seen from public, anon, authenticated;

create or replace function public.note_in_the_app()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;
  insert into private.app_seen (user_id, at)
  values (me, now())
  on conflict (user_id) do update set at = excluded.at;
end;
$$;

revoke all on function public.note_in_the_app() from public, anon;
grant execute on function public.note_in_the_app() to authenticated;

comment on function public.note_in_the_app() is
  'The iPhone app, signed in, says the member has it. See 20261115130000.';

-- Seen in the app within the last six months, or holding an app's
-- notification token: an app deleted since stops being offered once Apple
-- refuses its token (push-notify forgets it) or six months pass.
create or replace function public.i_have_the_app()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from private.app_seen s
       where s.user_id = auth.uid() and s.at > now() - interval '6 months'
    )
    or exists (
      select 1 from public.push_subscriptions p
       where p.member_id = auth.uid() and p.endpoint like 'apns:%'
    )
  );
$$;

revoke all on function public.i_have_the_app() from public, anon;
grant execute on function public.i_have_the_app() to authenticated;

comment on function public.i_have_the_app() is
  'Whether the club knows the signed-in member has the iPhone app, for the nudge. See 20261115130000.';
