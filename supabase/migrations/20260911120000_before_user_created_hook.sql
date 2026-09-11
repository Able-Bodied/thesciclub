-- ============================================================================
-- before_user_created — built, tested, and deliberately NOT enabled
-- ============================================================================
-- A Before User Created auth hook that refuses account creation for a phone
-- number that is not on the invite list. It works. It is switched off, and the
-- reason is recorded here rather than lost in a conversation.
--
-- ---------------------------------------------------------------------------
-- What it costs
-- ---------------------------------------------------------------------------
-- The hook fires on the OTP *request*, before any SMS is sent — verified
-- against a local stack, not assumed. So enabling it saves the message and
-- stops a junk auth account. It also makes /auth/v1/otp answer differently for
-- an invited number than for an uninvited one:
--
--     invited    -> 200
--     uninvited  -> 403 "This number is not on the club's list."
--
-- That endpoint is public and unauthenticated. Anybody can POST a phone number
-- to it and learn whether that number is on the list. Everybody on this list
-- has a spinal cord injury, so the answer discloses a protected health
-- condition about an identifiable person — to an ex-partner, an employer, a
-- neighbour — for the cost of one request.
--
-- Rate limiting does not fix the case that matters. It slows bulk enumeration;
-- checking one specific person you already suspect takes a single request, and
-- that is the disclosure with teeth.
--
-- ---------------------------------------------------------------------------
-- What it does not buy
-- ---------------------------------------------------------------------------
-- The protection usually attributed to this hook — "an uninvited person must
-- not be able to see the club" — is not its job and never was. That was a hole
-- in browse_members, which granted to `authenticated` without asking whether
-- the caller was a member. It is closed in the previous migration, and it is
-- closed whether or not this hook runs.
--
-- So the hook prevents an unusable account and one SMS. Against a permanent,
-- public, per-number health disclosure, that is not a trade worth making.
--
-- ---------------------------------------------------------------------------
-- If you enable it anyway
-- ---------------------------------------------------------------------------
-- Uncomment [auth.hook.before_user_created] in supabase/config.toml for local,
-- and set the same hook in the hosted project's dashboard under
-- Authentication > Hooks, pointing at pg-functions://postgres/public/before_user_created.
-- Do that knowing the paragraph above, not instead of reading it.
-- ============================================================================

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Payload shape confirmed against a live GoTrue 2.196 local stack:
  -- { "user": { "phone": "14085550112", ... }, "metadata": { ... } }
  candidate text := public.normalize_phone(event -> 'user' ->> 'phone');
begin
  if candidate <> '' and public.has_active_invite(candidate) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'This number is not on the club''s list.'
    )
  );
end;
$$;

comment on function public.before_user_created(jsonb) is
  'Invite gate for the Before User Created auth hook. NOT enabled — see this migration''s header for why.';

-- Granted so the hook works the moment it is switched on, and so the grant is
-- not a second thing to remember later.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.has_active_invite(text) to supabase_auth_admin;
grant execute on function public.normalize_phone(text) to supabase_auth_admin;
