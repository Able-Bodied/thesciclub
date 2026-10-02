-- ============================================================================
-- Trigger functions, and nearby_events, are not part of the API
-- ============================================================================
-- From the Supabase advisor, 2026-10-01: definer functions anybody could call
-- at /rest/v1/rpc/<name>, signed in or not.
--
-- 1. Five trigger functions. Called as an RPC, each only fails ("trigger
--    functions can only be called as triggers"), so nothing leaked; but they
--    are not meant to be reachable, and the three newer trigger functions
--    (push_notify_enqueue, chat_check_message_reply, chat_check_post_reply)
--    were already revoked. A trigger fires whatever its function's grants: a
--    member's insert still bumps a thread, and Auth's delete of a user still
--    deletes the member, checked on a local stack after this ran.
--
-- 2. nearby_events. 20260911190000 withheld latitude and longitude from anon
--    and authenticated, so "within 25 miles of me" could be answered without
--    "where exactly is this support group", and judged the worst case to be a
--    binary search on the radius. But it returns each event's exact
--    distance_km, so three calls from three origins give an event's
--    coordinates outright — including an event whose location is coarse on
--    purpose (location_precision, needs_pii_review). Nothing calls it: not the
--    app, not jobs/, not an edge function. So nobody may, until Events has a
--    distance filter and that filter decides what it may say (whether an
--    event is in range, or a rounded distance). The service role keeps it.
-- ============================================================================

-- --------------------------------------------------- 1. trigger functions
revoke all on function public.chat_bump_thread() from public, anon, authenticated;
revoke all on function public.chat_bump_topic() from public, anon, authenticated;
revoke all on function public.consume_invite_for_new_member() from public, anon, authenticated;
revoke all on function public.delete_member_for_deleted_user() from public, anon, authenticated;
revoke all on function public.invites_refuse_blocked() from public, anon, authenticated;

-- ------------------------------------------------------- 2. nearby_events
revoke all on function public.nearby_events(double precision, double precision, double precision)
  from public, anon, authenticated;
