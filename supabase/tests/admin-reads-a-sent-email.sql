-- Run after 20261123150000. Only an administrator learns which Resend email a row was.
begin;

do $$
begin
  if has_function_privilege('anon', 'public.admin_email_message_id(bigint)', 'execute') then
    raise exception 'Anonymous clients can ask which email a row was';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  perform public.admin_email_message_id(1);
  raise exception 'A member who is not an administrator was answered';
exception when insufficient_privilege then
  null;
end $$;

rollback;
