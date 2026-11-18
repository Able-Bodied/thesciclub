-- ============================================================================
-- A message on a single invite (20261117160000)
-- ============================================================================
-- Adm, an administrator, and Men, a mentor, each make an invite with a
-- message through the new versions: the message is on the row, trimmed, and
-- the note beside it. Empty words are none. A message over 1,000 characters
-- is refused, and so is a member who may not invite, by the old version's
-- own check. The versions without a message still work as before. Run
-- against the test project on 2026-11-17: "adm: See you there!/rugby/Ana;
-- blank: null; long: refused: The message can be up to 1,000 characters.;
-- old: null/plain; men: Come meet us/null/<Men's id>; peer: refused".
--
--   node --env-file=.env.local <runner> supabase/tests/a-message-on-a-single-invite.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare
  adm text; men text; blank text; long text := 'ok'; peer text := 'ok'; old text;
begin
  insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
    ('a5500000-1117-0000-0000-000000000001', 'peer',   'active', 'Adm', '19991117101', '1980-01-01', 'T1–T6', 'CA', true),
    ('a5500000-1117-0000-0000-000000000002', 'mentor', 'active', 'Men', '19991117102', '1980-01-01', 'T1–T6', 'CA', false),
    ('a5500000-1117-0000-0000-000000000003', 'peer',   'active', 'Per', '19991117103', '1980-01-01', 'T1–T6', 'CA', false);

  perform set_config('request.jwt.claims', '{"sub":"a5500000-1117-0000-0000-000000000001","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select coalesce(i.message, 'null') || '/' || coalesce(i.note, 'null') || '/' || coalesce(i.invitee_name, 'null')
    into adm
    from public.admin_create_invite(raw_email => 'adm1117@probe.test', p_message => '  See you there!  ',
                                    note => 'rugby', p_name => 'Ana') i;
  select coalesce(i.message, 'null') into blank
    from public.admin_create_invite(raw_email => 'blank1117@probe.test', p_message => '   ') i;
  begin
    perform public.admin_create_invite(raw_email => 'long1117@probe.test', p_message => repeat('x', 1001));
  exception when others then long := 'refused: ' || sqlerrm;
  end;
  select coalesce(i.message, 'null') || '/' || coalesce(i.note, 'null') into old
    from public.admin_create_invite(raw_email => 'old1117@probe.test', organization_id => null, note => 'plain') i;

  perform set_config('request.jwt.claims', '{"sub":"a5500000-1117-0000-0000-000000000002","role":"authenticated"}', true);
  select coalesce(i.message, 'null') || '/' || coalesce(i.note, 'null') || '/' || i.invited_by_member_id::text
    into men
    from public.create_my_invite(raw_email => 'men1117@probe.test', p_message => 'Come meet us') i;

  perform set_config('request.jwt.claims', '{"sub":"a5500000-1117-0000-0000-000000000003","role":"authenticated"}', true);
  begin
    perform public.create_my_invite(raw_email => 'per1117@probe.test', p_message => 'Hi');
    peer := 'allowed';
  exception when others then peer := 'refused';
  end;

  raise exception 'RESULT adm: %; blank: %; long: %; old: %; men: %; peer: %', adm, blank, long, old, men, peer;
end;
$$;
