#!/bin/bash
# ============================================================================
# Does the speed limit hold for messages and posts sent at the same moment?
# ============================================================================
# 20261113020000. 45 messages and 30 posts at once, by one member.
#   expect: messages saved (limit 30): 30
#   expect: posts saved (limit 20): 20
# Before the lock the load-test robots got 38 of 45 messages through
# (2026-11-12): every insert counted before any other had committed.
#
# A race cannot be shown inside one rolled-back transaction, so unlike the
# .sql probes this one commits and deletes its own rows at the end. Run it on
# a local or throwaway stack only, never the hosted project:
#
#   bash supabase/tests/speed-limit-race.sh [db port, default 54322]
# ============================================================================

PORT=${1:-54322}
PSQL="docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -qAt"
A=aaaaaaaa-1113-0000-0000-00000000000a
B=bbbbbbbb-1113-0000-0000-00000000000b
T=11111111-1113-0000-0000-000000000001
P=11130000-0000-0000-0000-000000000001

$PSQL <<SQL
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('$A', 'peer', 'active', 'Ana', '19990111300', '1980-01-01', 'C5–C8', 'CA'),
       ('$B', 'peer', 'active', 'Bo',  '19990111301', '1981-01-01', 'C5–C8', 'CA');
insert into public.chat_threads (id, kind, direct_key) values ('$T', 'direct', '$A:$B');
insert into public.chat_thread_members (thread_id, member_id) values ('$T', '$A'), ('$T', '$B');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-speed-race', 'Probe speed race', 'For the probe.', 'Life', 9113, now());
insert into public.chat_topics (id, room_id, title, author_id) values ('$P', 'probe-speed-race', 'Ana asks', '$A');
SQL

# One session per insert, each held open a moment so the others overlap it.
# A refused one prints the limit's error; that is expected and not shown.
one() {
  $PSQL >/dev/null 2>&1 <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"$A","role":"authenticated"}', true);
$1
select pg_sleep(0.3);
commit;
SQL
}
for i in $(seq 1 45); do one "insert into public.chat_messages (thread_id, author_id, body) values ('$T', '$A', 'race $i');" & done
for i in $(seq 1 30); do one "insert into public.chat_posts (topic_id, author_id, body) values ('$P', '$A', 'race $i');" & done
wait

echo "messages saved (limit 30): $($PSQL -c "select count(*) from public.chat_messages where author_id = '$A'")"
echo "posts saved (limit 20): $($PSQL -c "select count(*) from public.chat_posts where author_id = '$A'")"

$PSQL <<SQL
delete from public.chat_posts where topic_id = '$P';
delete from public.chat_topics where id = '$P';
delete from public.chat_rooms where id = 'probe-speed-race';
delete from public.chat_messages where thread_id = '$T';
delete from public.chat_threads where id = '$T';
delete from public.members where id in ('$A', '$B');
SQL
