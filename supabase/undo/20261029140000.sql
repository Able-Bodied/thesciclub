-- Undo for 20261029140000_counts_without_building_lists.sql: the bodies
-- before it, from pg_get_functiondef on a fresh stack (2026-10-29).
-- Compare with the live definitions before release.

CREATE OR REPLACE FUNCTION public.chat_unread_count()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*)::int from public.chat_my_threads() where unread;
$function$
;
CREATE OR REPLACE FUNCTION public.my_unseen_notification_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from public.my_notifications(null, 100) n where not n.seen;
$function$
;
