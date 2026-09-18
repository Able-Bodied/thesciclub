/**
 * Can an administrator clear another member's photograph, and can a member not?
 *
 *   pnpm exec supabase start …   # a local stack must be running
 *   node scripts/check-photo-policy.mjs
 *
 * This exists because supabase/tests/photo-cleanup.sql *cannot* answer it.
 * Supabase installs `storage.protect_delete()`, which refuses every direct
 * delete from `storage.objects` before RLS is consulted — so in SQL an
 * administrator, a member, a stranger and nobody all produce the same error,
 * and a file full of those looks exactly like a file full of policies working.
 *
 * The only honest test goes through the Storage API with real JWTs, which is
 * also the path the app takes. Signs its own tokens with the local JWT secret;
 * it is the well-known development one and this never runs anywhere else.
 */

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (pnpm exec supabase status prints it).');
  process.exit(1);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    sub,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const ADMIN = 'aaaaaaaa-6666-0000-0000-00000000000a';
const MEMBER = 'bbbbbbbb-6666-0000-0000-00000000000b';
const OTHER = 'cccccccc-6666-0000-0000-00000000000c';

const ANON = process.env.SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY too — see below for why it cannot be the service key.');
  process.exit(1);
}

const root = createClient(API, SERVICE, { auth: { persistSession: false } });

/**
 * A client acting as one member.
 *
 * Keyed with the **anon** key, not the service key. Storage authorises on the
 * `apikey` header as well as on `Authorization`, so a client built with the
 * service key runs as `service_role` and bypasses RLS entirely however the
 * bearer token is set — which made the first version of this script report that
 * a member could delete somebody else's photograph and that a signed-out
 * visitor could too. Both were the harness, not the policy.
 */
const as = (id) =>
  createClient(API, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt(id)}` } },
  });

const member = (id, name, admin) => ({
  id,
  type: 'peer',
  status: 'active',
  display_name: name,
  phone: `1999000${Math.floor(Math.random() * 9000 + 1000)}`,
  birth_date: '1980-01-01',
  level_range: 'T1–T6',
  state: 'CA',
  is_admin: admin,
});

/**
 * Refuse to run without a storage service, loudly.
 *
 * The local stack in this project starts with `-x storage-api`, so every
 * storage call returns "name resolution failed" — the uploads silently do not
 * happen, `exists()` is false from the start, and a check written as "the file
 * should still be there" reports FAIL. The first run of this script announced
 * two policy holes that did not exist.
 *
 * Wrong in that direction is still wrong: a harness that cannot reach the thing
 * it tests must say so rather than produce results. Start the stack without
 * excluding storage-api.
 */
async function requireStorage() {
  const probe = await root.storage.from('photos').list('', { limit: 1 });
  if (!probe.error) return;
  console.error(`\n  Storage is not reachable: ${probe.error.message}`);
  console.error('  The local stack is probably running with -x storage-api.');
  console.error('  Restart it without that exclusion — nothing here can be tested without it.\n');
  process.exit(2);
}

let failed = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
};

await requireStorage();

await root.from('members').delete().in('id', [ADMIN, MEMBER, OTHER]);
await root
  .from('members')
  .insert([
    member(ADMIN, 'Policy Admin', true),
    member(MEMBER, 'Policy Member', false),
    member(OTHER, 'Policy Other', false),
  ]);

const put = async (owner) => {
  await root.storage.from('photos').upload(`${owner}/probe.txt`, Buffer.from('x'), {
    upsert: true,
    contentType: 'text/plain',
  });
};
const exists = async (owner) => {
  const { data } = await root.storage.from('photos').list(owner);
  return (data ?? []).some((o) => o.name === 'probe.txt');
};

console.log('\nStorage delete policy, through the API that actually governs it:\n');

await put(MEMBER);
await as(OTHER)
  .storage.from('photos')
  .remove([`${MEMBER}/probe.txt`]);
check("a member cannot delete another member's photograph", await exists(MEMBER), true);

await as(MEMBER)
  .storage.from('photos')
  .remove([`${MEMBER}/probe.txt`]);
check('a member can delete their own', await exists(MEMBER), false);

await put(MEMBER);
await as(ADMIN)
  .storage.from('photos')
  .remove([`${MEMBER}/probe.txt`]);
check("an administrator can clear another member's", await exists(MEMBER), false);

await put(MEMBER);
await createClient(API, ANON)
  .storage.from('photos')
  .remove([`${MEMBER}/probe.txt`]);
check('a signed-out visitor cannot', await exists(MEMBER), true);

await root.storage.from('photos').remove([`${MEMBER}/probe.txt`]);
await root.from('members').delete().in('id', [ADMIN, MEMBER, OTHER]);
console.log(failed ? `\n${failed} failed.\n` : '\nAll passed.\n');
process.exit(failed ? 1 : 0);
