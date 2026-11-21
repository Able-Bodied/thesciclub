-- ============================================================================
-- One "finish your profile" reminder
-- ============================================================================
-- The owner, 2026-11-12: Your profile is one thing now, details and answers in
-- one list with one percentage, so its reminders are one series too. There
-- were two: "finish Your details" until those were done, then "finish your
-- profile", up to five each. Now it is one series of up to five, a week
-- apart, while either is unfinished; a tap opens where the profile was left
-- (the app sends /profile/details and /profile?resume there).
--
-- Reminders already sent count, whichever step they were for, so somebody
-- part way through the old series carries on rather than starting again.
-- ============================================================================

create or replace function public.profile_reminders_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  insert into public.profile_reminders (member_id, step, sent_on)
  select m.id, 'profile', today
    from public.members m
   where not (public.member_details_done(m) and public.member_profile_done(m))
     and m.status = 'active'
     and m.type <> 'organization'
     and not m.is_seed
     and m.created_at <= now() - interval '2 days'
     and (select count(*) from public.profile_reminders r where r.member_id = m.id) < 5
     and not exists (
       select 1 from public.profile_reminders r
        where r.member_id = m.id and r.sent_on > today - 7
     )
     and not exists (
       select 1 from public.push_muted_kinds x
        where x.member_id = m.id and x.kind = 'profile_reminder'
     )
  on conflict do nothing;
  if found then
    perform public.push_notify_send('profile_reminder', jsonb_build_object('day', today));
  end if;
end;
$$;
revoke all on function public.profile_reminders_notify() from public, anon, authenticated;
