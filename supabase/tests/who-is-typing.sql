-- ============================================================================
-- Who is typing: only a conversation's members hear or say it (20261118140000)
-- ============================================================================
-- Ann and Ben are in a group, with Pat, who is suspended (paused). Cal is not in it.
-- Realtime asks realtime.messages' policies, with realtime.topic() set to the
-- channel, before a socket may hear (select) or say (insert) on it.
--   * Ann hears and says on typing:<the group>.
--   * Cal, outside it, does neither: a guessed id gets nothing.
--   * Pat, suspended, does neither, as a suspended member reads no messages.
--   * A topic that is not typing:<uuid> is refused, not an error.
-- Run against the test project on 2026-11-18:
--   "ann: hears/says; cal: deaf/refused; pat: deaf/refused; odd: deaf/refused".
--
--   node --env-file=.env.local <runner> supabase/tests/who-is-typing.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare
  t constant uuid := 'a5500000-1118-0000-0000-0000000000aa';
  ann constant uuid := 'a5500000-1118-0000-0000-000000000001';
  ben constant uuid := 'a5500000-1118-0000-0000-000000000002';
  cal constant uuid := 'a5500000-1118-0000-0000-000000000003';
  pat constant uuid := 'a5500000-1118-0000-0000-000000000004';
  who record;
  heard int;
  said text;
  result text := '';
begin
  insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
    (ann, 'peer', 'active', 'Ann', '19991118101', '1980-01-01', 'T1–T6', 'CA'),
    (ben, 'peer', 'active', 'Ben', '19991118102', '1980-01-01', 'T1–T6', 'CA'),
    (cal, 'peer', 'active', 'Cal', '19991118103', '1980-01-01', 'T1–T6', 'CA'),
    (pat, 'peer', 'suspended', 'Pat', '19991118104', '1980-01-01', 'T1–T6', 'CA');
  insert into public.chat_threads (id, kind, name) values (t, 'group', 'Probe');
  insert into public.chat_thread_members (thread_id, member_id) values (t, ann), (t, ben), (t, pat);
  -- Something on the channel to hear.
  insert into realtime.messages (topic, extension, event, payload, private)
    values ('typing:' || t, 'broadcast', 'typing', jsonb_build_object('member', ben), true);

  perform set_config('role', 'authenticated', true);
  for who in
    select * from (values (ann, 'ann', 'typing:' || t), (cal, 'cal', 'typing:' || t),
                          (pat, 'pat', 'typing:' || t), (ann, 'odd', 'typing:not-a-uuid')) v(id, label, topic)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', who.id, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', who.topic, true);
    select count(*) into heard from realtime.messages where extension = 'broadcast';
    begin
      insert into realtime.messages (topic, extension, event, payload, private)
        values (who.topic, 'broadcast', 'typing', jsonb_build_object('member', who.id), true);
      said := 'says';
    exception when others then said := 'refused';
    end;
    result := result || who.label || ': ' || case when heard > 0 then 'hears' else 'deaf' end
                     || '/' || said || '; ';
  end loop;

  raise exception 'RESULT %', rtrim(result, '; ');
end;
$$;
