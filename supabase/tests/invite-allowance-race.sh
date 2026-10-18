#!/bin/bash
# ============================================================================
# Does a mentor's allowance hold when invites are made at the same moment?
# ============================================================================
# 20261018030000 (security scan of 2026-10-17, F14). Six create_my_invite
# calls at once, for a mentor with nine of their ten invites live.
#   expect: live invites for the mentor (limit 10): 10
# Before the lock it printed 15: every call counted nine before any had
# committed.
#
# A race cannot be shown inside one rolled-back transaction, so unlike the
# .sql probes this one commits, from seven connections, and deletes its own
# rows at the end. Run it on a local or throwaway stack only, never the hosted
# project:
#
#   bash supabase/tests/invite-allowance-race.sh [db port, default 54322]
# ============================================================================

PORT=${1:-54322}
PSQL="docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -qAt"
M=eeeeeeee-1821-0000-0000-00000000000e

$PSQL <<SQL
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('$M', 'mentor', 'active', 'Racer', '19990002101', '1981-01-01', 'C5–C8', 'CA');
insert into public.invites (email, invited_by_member_id)
select 'race' || g || '@probe.test', '$M' from generate_series(1, 9) g;
SQL

# Each call holds its transaction open a moment, so the others overlap it.
for i in 1 2 3 4 5 6; do
  $PSQL >/dev/null 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims', '{"sub":"$M","role":"authenticated"}', true);
set local role authenticated;
select public.create_my_invite('parallel$i@probe.test');
select pg_sleep(0.5);
commit;
SQL
done
wait

limit=$($PSQL -c 'select public.mentor_invite_limit()')
live=$($PSQL -c "select count(*) from public.invites where invited_by_member_id = '$M' and status in ('pending', 'consumed')")
echo "live invites for the mentor (limit $limit): $live"

$PSQL -c "delete from public.invites where invited_by_member_id = '$M'; delete from public.members where id = '$M';"
