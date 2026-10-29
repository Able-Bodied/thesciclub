-- ============================================================================
-- Agreeing to the terms
-- ============================================================================
-- The owner, 2026-10-29: one screen, "Before you join", the first after an
-- account is made. It says what members share is experience and opinion, not
-- medical advice; to check with a doctor before changing anything; that
-- meeting in person is their own choice and risk; and that tapping Continue
-- confirms they are 18 or older and agree to the Terms of Service and the
-- Privacy Policy.
--
-- Kept here: when each account agreed, and to which version (the date the
-- Terms page shows, src/lib/terms.ts). Agreeing twice to the same version
-- keeps the first time. It goes with the account (on delete cascade).
--
-- Read and written only through the two functions below, by the account
-- itself.
-- ============================================================================

create table public.terms_agreements (
  user_id uuid not null references auth.users (id) on delete cascade,
  version date not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.terms_agreements enable row level security;
revoke all on public.terms_agreements from public, anon, authenticated;

-- The latest version this account agreed to, or null.
create function public.my_terms_agreement()
returns date
language sql
security definer
stable
set search_path = ''
as $$
  select max(version) from public.terms_agreements where user_id = auth.uid();
$$;

revoke all on function public.my_terms_agreement() from public, anon;
grant execute on function public.my_terms_agreement() to authenticated;

create function public.agree_to_terms(p_version date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  -- A version is a date the Terms have carried: never one still to come.
  if p_version is null or p_version < date '2026-10-29' or p_version > current_date + 1 then
    raise exception 'Those are not the current terms. Reload and try again.' using errcode = '22023';
  end if;
  insert into public.terms_agreements (user_id, version)
  values (auth.uid(), p_version)
  on conflict (user_id, version) do nothing;
end;
$$;

revoke all on function public.agree_to_terms(date) from public, anon;
grant execute on function public.agree_to_terms(date) to authenticated;
