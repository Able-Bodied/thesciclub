-- ============================================================================
-- Proving the address an invite went to
-- ============================================================================
-- The owner, 2026-11-02. Somebody invited at one address can sign in with Apple
-- or Google at another, Apple's hidden address included. With the invite's link
-- that works (claim_invite). Without it they are told the address is not on the
-- list, and nothing they have can move the invite across.
--
-- So the refused screen takes the address the invite went to and emails it a
-- code, and the code claims the invite for the account they are signed in with.
-- The code is what makes this safe: being on the list is not secret from the
-- person it names, and it is from everybody else (20261012000000). Letting in
-- whoever types a listed address would take an invite from the person it was
-- for, and would answer "is this person on the list?" for anybody who asked.
--
-- start_invite_proof answers true when there is an email to send. The caller
-- must not pass that on: an address on the list and one that is not look the
-- same from outside (see functions/prove-invite).
--
-- A code lasts 10 minutes and takes 5 tries. Sending is limited to one a
-- minute, 3 an hour for an account, and 5 an hour to an address, so this cannot
-- be used to fill somebody's inbox. Only the salted hash of a code is kept, and
-- a row is deleted the day after it runs out.
-- ============================================================================

create table public.invite_proofs (
  account uuid primary key references auth.users (id) on delete cascade,
  invite_id uuid not null references public.invites (id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  tries smallint not null default 0,
  sent_at timestamptz not null default now(),
  sends smallint not null default 1,
  window_started_at timestamptz not null default now()
);

comment on table public.invite_proofs is
  'A code emailed to the address an invite went to, for somebody signed in at another. Read and written only by the functions below. See 20261102040000.';

create index invite_proofs_email_idx on public.invite_proofs (email);

alter table public.invite_proofs enable row level security;
revoke all on table public.invite_proofs from public, anon, authenticated;

create or replace function public.start_invite_proof(
  p_account uuid,
  p_email text,
  p_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := lower(btrim(coalesce(p_email, '')));
  invite uuid;
  mine public.invite_proofs%rowtype;
begin
  delete from public.invite_proofs where expires_at < now() - interval '1 day';

  if p_account is null or address = '' or coalesce(p_code_hash, '') = '' then
    return false;
  end if;
  if exists (select 1 from public.members where id = p_account) then
    return false;
  end if;
  if public.is_blocked_email(private.confirmed_email(p_account))
     or public.is_blocked_email(address) then
    return false;
  end if;

  select i.id into invite
    from public.invites i
   where i.status = 'pending'
     and lower(i.email::text) = address
     and (i.claimed_by is null or i.claimed_by = p_account)
   order by i.created_at desc
   limit 1;
  if invite is null then
    return false;
  end if;

  if (select coalesce(sum(p.sends), 0)
        from public.invite_proofs p
       where p.email = address
         and p.window_started_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;

  select * into mine from public.invite_proofs where account = p_account for update;
  if found then
    if mine.sent_at > now() - interval '1 minute' then
      return false;
    end if;
    if mine.window_started_at > now() - interval '1 hour' and mine.sends >= 3 then
      return false;
    end if;
  end if;

  insert into public.invite_proofs (account, invite_id, email, code_hash, expires_at)
  values (p_account, invite, address, p_code_hash, now() + interval '10 minutes')
  on conflict (account) do update
    set invite_id = excluded.invite_id,
        email = excluded.email,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        tries = 0,
        sent_at = now(),
        sends = case
          when public.invite_proofs.window_started_at > now() - interval '1 hour'
            then public.invite_proofs.sends + 1
          else 1
        end,
        window_started_at = case
          when public.invite_proofs.window_started_at > now() - interval '1 hour'
            then public.invite_proofs.window_started_at
          else now()
        end;
  return true;
end;
$$;

comment on function public.start_invite_proof(uuid, text, text) is
  'True when a code should be emailed to this address for this account. Never tell the caller which. See 20261102040000.';

-- Every refusal is the same `false`, as in claim_invite.
create or replace function public.finish_invite_proof(p_account uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  proof public.invite_proofs%rowtype;
  claimed boolean;
begin
  select * into proof from public.invite_proofs where account = p_account for update;
  if not found or proof.expires_at < now() or proof.tries >= 5 then
    return false;
  end if;
  if proof.code_hash is distinct from p_code_hash then
    update public.invite_proofs set tries = tries + 1 where account = p_account;
    return false;
  end if;
  if exists (select 1 from public.members where id = p_account) then
    return false;
  end if;

  update public.invites
     set claimed_by = p_account,
         claimed_at = coalesce(claimed_at, now())
   where id = proof.invite_id
     and status = 'pending'
     and (claimed_by is null or claimed_by = p_account);
  claimed := found;

  delete from public.invite_proofs where account = p_account;
  return claimed;
end;
$$;

comment on function public.finish_invite_proof(uuid, text) is
  'Claims the invite for this account if the code is right. See 20261102040000.';

revoke all on function public.start_invite_proof(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finish_invite_proof(uuid, text) from public, anon, authenticated;
grant execute on function public.start_invite_proof(uuid, text, text) to service_role;
grant execute on function public.finish_invite_proof(uuid, text) to service_role;
