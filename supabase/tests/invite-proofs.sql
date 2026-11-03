-- Run by hand against a database with the migrations applied; leaves nothing.
-- Who may reach the code functions, and that a right code claims the invite.
begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.start_invite_proof(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.finish_invite_proof(uuid, text)', 'execute') then
    raise exception 'a client can reach the code functions';
  end if;
  if has_table_privilege('authenticated', 'public.invite_proofs', 'select') then
    raise exception 'a client can read the codes';
  end if;
end;
$$;

do $$
declare
  account uuid := gen_random_uuid();
  invite uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role)
  values (account, 'proof-probe@relay.invalid', now(), 'authenticated', 'authenticated');
  insert into public.invites (email) values ('proof-probe@elsewhere.invalid') returning id into invite;

  if public.start_invite_proof(account, 'nobody-listed@elsewhere.invalid', 'h') then
    raise exception 'an address with no invite was sent a code';
  end if;
  if not public.start_invite_proof(account, 'Proof-Probe@elsewhere.invalid ', 'right') then
    raise exception 'a listed address was not sent a code';
  end if;
  if public.start_invite_proof(account, 'proof-probe@elsewhere.invalid', 'again') then
    raise exception 'a second code inside a minute';
  end if;
  if public.finish_invite_proof(account, 'wrong') then
    raise exception 'a wrong code claimed the invite';
  end if;
  if not public.finish_invite_proof(account, 'right') then
    raise exception 'the right code did not claim the invite';
  end if;
  if (select claimed_by from public.invites where id = invite) is distinct from account then
    raise exception 'the invite is not this account''s';
  end if;
  if public.finish_invite_proof(account, 'right') then
    raise exception 'a code worked twice';
  end if;
end;
$$;

rollback;
