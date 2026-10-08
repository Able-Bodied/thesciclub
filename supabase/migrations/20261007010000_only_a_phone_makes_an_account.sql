-- ============================================================================
-- Only a phone number makes an account
-- ============================================================================
-- A member can link Google from Me and then sign in with it (2026-10-07). The
-- sign-in screen offers Google to everybody, because it cannot know who is
-- signing in until they have — and Supabase answers an unlinked Google
-- account by making a new one. That account could never be a member: invites
-- name phone numbers, and it has none. But it would sit in auth.users holding
-- a stranger's name and email, which the club has no reason to keep.
--
-- So this Before User Created hook refuses any new account without a phone
-- number. Linking Google to an existing member creates no user and never
-- reaches it; signing up by text message carries the number and passes.
--
-- It says nothing about the invite list, which is the difference from
-- before_user_created (20260911120000), left off for the reason in its header.
-- This one answers the same for every phone number, so it tells nobody
-- whether a number is on the list.
--
-- Switched on in supabase/config.toml for the local stack. The hosted project
-- needs it set by hand: Authentication > Hooks > Before User Created,
-- pointing at public.only_a_phone_makes_an_account. Without it the app still
-- signs such an account straight back out (src/lib/google-sign-in.ts); the
-- row is what the hook saves.
-- ============================================================================

create or replace function public.only_a_phone_makes_an_account(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  -- Payload confirmed for phone sign-ups in 20260911120000:
  -- { "user": { "phone": "14085550112", ... }, ... }. An OAuth sign-up has
  -- an empty or missing phone.
  if coalesce(event -> 'user' ->> 'phone', '') <> '' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your phone number first, then link Google from Me.'
    )
  );
end;
$$;

comment on function public.only_a_phone_makes_an_account(jsonb) is
  'Before User Created hook: refuses any new account without a phone number. See this migration''s header.';

revoke execute on function public.only_a_phone_makes_an_account(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.only_a_phone_makes_an_account(jsonb) to supabase_auth_admin;
