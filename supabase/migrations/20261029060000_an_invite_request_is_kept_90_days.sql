-- ============================================================================
-- An invite request is kept 90 days
-- ============================================================================
-- The owner, 2026-10-28: a request for an invite (20261029030000) is deleted
-- 90 days after an org admin answers it, or 90 days after it was sent if
-- nobody does. Nightly, as onboarding drafts are (20261015015000).
-- ============================================================================

create index if not exists invite_requests_created_idx on public.invite_requests (created_at);

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'invite-requests-expire';
  perform cron.schedule(
    'invite-requests-expire', '45 11 * * *',
    $job$delete from public.invite_requests
          where answered_at < now() - interval '90 days'
             or (status = 'open' and created_at < now() - interval '90 days')$job$);
end;
$$;
