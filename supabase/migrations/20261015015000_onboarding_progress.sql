-- ============================================================================
-- Onboarding picks up where it was left, on any device
-- ============================================================================
-- The owner, 2026-10-15. Onboarding wrote nothing until its last step, so
-- somebody who closed the app halfway lost every answer and started again
-- from the terms, and nobody could see which step they stopped at.
--
-- Two tables, kept apart because they live for different lengths of time:
--
--   onboarding_progress  the answers so far and the step they were on, one
--                        row an account. Read back by its own account only
--                        (my_onboarding_progress), on any device, so the
--                        wizard opens where it was left. Deleted the moment
--                        the member is made, since the member row now holds
--                        the answers, and after 90 days untouched: an
--                        abandoned birthday and injury level are not kept.
--   onboarding_steps     which steps an account has reached, and when.
--                        Nothing else, so it can be kept for Admin → Stats
--                        (counted, never listed). Goes with the account.
--
-- The device keeps its own copy (src/routes/onboarding/progress.ts), so a
-- dropped connection loses nothing either; this is the copy that follows the
-- person to another phone.
--
-- Only these answers are kept, whatever is sent: never the password, the
-- email (the account has it), the ZIP (only a lookup) or the photograph.
-- ============================================================================

create table public.onboarding_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  step       text not null check (step in (
               'agree', 'name', 'username', 'birthday', 'injury', 'city', 'phone', 'photo')),
  answers    jsonb not null default '{}'::jsonb
               check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 8192),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_progress is
  'Onboarding answers so far, for picking up on another device. Its own account only, deleted at the end. See 20261015015000.';

create table public.onboarding_steps (
  user_id    uuid not null references auth.users (id) on delete cascade,
  step       text not null check (step in (
               'agree', 'name', 'username', 'birthday', 'injury', 'city', 'phone', 'photo')),
  reached_at timestamptz not null default now(),
  primary key (user_id, step)
);

comment on table public.onboarding_steps is
  'Which onboarding steps an account reached, for Admin → Stats counts. See 20261015015000.';

alter table public.onboarding_progress enable row level security;
alter table public.onboarding_steps enable row level security;
revoke all on public.onboarding_progress from public, anon, authenticated;
revoke all on public.onboarding_steps from public, anon, authenticated;

-- The answers a member row is made from, and nothing else.
create or replace function private.onboarding_answers(answers jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb)
    from jsonb_each(coalesce(answers, '{}'::jsonb)) a
   where a.key in (
     'termsAgreed', 'displayName', 'username', 'usernameChecked',
     'birthMonth', 'birthDay', 'birthYear', 'birthDate',
     'injuryType', 'exactLevel', 'conditionName', 'completeness',
     'injuryYear', 'injuryMonth', 'injuryDay',
     'city', 'state', 'phone', 'declined');
$$;

revoke all on function private.onboarding_answers(jsonb) from public, anon, authenticated;

-- For the wizard, each time it moves on: the step it is on and the answers so
-- far. Nothing for somebody who is already a member.
create or replace function public.save_onboarding_progress(step text, answers jsonb)
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
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.members m where m.id = me) then
    return;
  end if;

  insert into public.onboarding_progress as p (user_id, step, answers, updated_at)
  values (me, save_onboarding_progress.step, private.onboarding_answers(answers), now())
  on conflict (user_id) do update
    set step = excluded.step, answers = excluded.answers, updated_at = excluded.updated_at;

  insert into public.onboarding_steps (user_id, step)
  values (me, save_onboarding_progress.step)
  on conflict do nothing;
end;
$$;

revoke all on function public.save_onboarding_progress(text, jsonb) from public, anon;
grant execute on function public.save_onboarding_progress(text, jsonb) to authenticated;

-- For the wizard as it opens: where this account was, or no row.
create or replace function public.my_onboarding_progress()
returns table (step text, answers jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.step, p.answers, p.updated_at
    from public.onboarding_progress p
   where p.user_id = auth.uid()
     and not exists (select 1 from public.members m where m.id = p.user_id);
$$;

revoke all on function public.my_onboarding_progress() from public, anon;
grant execute on function public.my_onboarding_progress() to authenticated;

-- The member row holds the answers now.
create or replace function private.onboarding_progress_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.onboarding_progress where user_id = new.id;
  return new;
end;
$$;

revoke all on function private.onboarding_progress_done() from public, anon, authenticated;

create trigger members_onboarding_progress_done
  after insert on public.members
  for each row execute function private.onboarding_progress_done();

-- An abandoned draft is not kept: 90 days untouched, nightly.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'onboarding-progress-expire';
  perform cron.schedule(
    'onboarding-progress-expire', '50 11 * * *',
    $job$delete from public.onboarding_progress where updated_at < now() - interval '90 days'$job$);
end;
$$;
