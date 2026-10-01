/**
 * Can an administrator clear another member's photograph, and can a member not?
 * Does the bucket refuse what its limits say it refuses? And, since it went
 * private (20261001000000), who can get a signed URL for what?
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

/**
 * A one-pixel PNG, because since 20260930040000 the bucket takes webp, JPEG
 * and PNG only — for the service key too. This used to upload `probe.txt` as
 * text/plain and ignore the result, so once the limit landed every `put` was
 * refused in silence: the two checks expecting the file gone passed without
 * a file ever being there. A refused `put` now stops the run.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const PROBE = 'probe.png';

const put = async (owner) => {
  const { error } = await root.storage.from('photos').upload(`${owner}/${PROBE}`, PNG, {
    upsert: true,
    contentType: 'image/png',
  });
  if (error) {
    console.error(`\n  Could not put the probe file in place: ${error.message}\n`);
    process.exit(2);
  }
};
const exists = async (owner) => {
  const { data } = await root.storage.from('photos').list(owner);
  return (data ?? []).some((o) => o.name === PROBE);
};

console.log('\nStorage delete policy, through the API that actually governs it:\n');

await put(MEMBER);
await as(OTHER)
  .storage.from('photos')
  .remove([`${MEMBER}/${PROBE}`]);
check("a member cannot delete another member's photograph", await exists(MEMBER), true);

await as(MEMBER)
  .storage.from('photos')
  .remove([`${MEMBER}/${PROBE}`]);
check('a member can delete their own', await exists(MEMBER), false);

await put(MEMBER);
await as(ADMIN)
  .storage.from('photos')
  .remove([`${MEMBER}/${PROBE}`]);
check("an administrator can clear another member's", await exists(MEMBER), false);

await put(MEMBER);
await createClient(API, ANON)
  .storage.from('photos')
  .remove([`${MEMBER}/${PROBE}`]);
check('a signed-out visitor cannot', await exists(MEMBER), true);

/**
 * The bucket's own limits (20260930040000), as the member who owns the
 * folder, so the policy would let both through and only the limit is left to
 * refuse them. The codes are what describeError sorts on.
 */
console.log("\nThe bucket's limits, as a member writing into their own folder:\n");

const tooLarge = await as(MEMBER)
  .storage.from('photos')
  .upload(`${MEMBER}/too-large.png`, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), {
    upsert: true,
    contentType: 'image/png',
  });
check('a file over 2MB is refused', tooLarge.error?.code ?? 'stored', 'EntityTooLarge');

const wrongType = await as(MEMBER)
  .storage.from('photos')
  .upload(`${MEMBER}/not-a-photo.heic`, PNG, { upsert: true, contentType: 'image/heic' });
check('a file of another type is refused', wrongType.error?.code ?? 'stored', 'InvalidMimeType');

const fits = await as(MEMBER)
  .storage.from('photos')
  .upload(`${MEMBER}/fits.png`, PNG, { upsert: true, contentType: 'image/png' });
check('a small PNG in their own folder is stored', fits.error?.code ?? 'stored', 'stored');

/**
 * The read side, since 20261001000000. A signed URL is the only way to a
 * photograph now, and storage grants one only where the select policy lets
 * the caller read the row. The claim card's face is in
 * supabase/tests/photos-bucket-reads.sql, which can set a phone claim.
 */
console.log('\nWho can read what, now the bucket is private:\n');

const NOT_YET = 'dddddddd-6666-0000-0000-00000000000d';
const LOGO = 'organizations/probe-logo.png';
await put(MEMBER);
{
  const { error } = await root.storage
    .from('photos')
    .upload(LOGO, PNG, { upsert: true, contentType: 'image/png' });
  if (error) {
    console.error(`\n  Could not put the probe logo in place: ${error.message}\n`);
    process.exit(2);
  }
}
const signs = async (client, path) =>
  !(await client.storage.from('photos').createSignedUrl(path, 60)).error;

check(
  "a member gets a signed URL for another member's photograph",
  await signs(as(OTHER), `${MEMBER}/${PROBE}`),
  true,
);
check(
  'a signed-out visitor gets none',
  await signs(createClient(API, ANON), `${MEMBER}/${PROBE}`),
  false,
);
check('…not even for a logo', await signs(createClient(API, ANON), LOGO), false);
check(
  "somebody signed in with no member row gets none for a member's photograph",
  await signs(as(NOT_YET), `${MEMBER}/${PROBE}`),
  false,
);
check('…and does get one for a logo', await signs(as(NOT_YET), LOGO), true);

const publicUrl = await fetch(`${API}/storage/v1/object/public/photos/${MEMBER}/${PROBE}`);
check('the old public URL no longer serves it', publicUrl.ok, false);

const { data: signedForMember } = await as(OTHER)
  .storage.from('photos')
  .createSignedUrl(`${MEMBER}/${PROBE}`, 60);
const served = signedForMember ? await fetch(signedForMember.signedUrl) : null;
check('a signed URL serves it', served?.ok ?? false, true);

// Onboarding uploads before the member row exists, with upsert, and storage
// refuses an upsert without a select policy on the row, even the first one —
// which is why the policy lets an account read its own folder. Twice, so a
// second try at signup is covered too.
const firstTry = await as(NOT_YET)
  .storage.from('photos')
  .upload(`${NOT_YET}/profile.png`, PNG, { upsert: true, contentType: 'image/png' });
const secondTry = await as(NOT_YET)
  .storage.from('photos')
  .upload(`${NOT_YET}/profile.png`, PNG, { upsert: true, contentType: 'image/png' });
check(
  'somebody mid-signup can upload their photograph twice',
  `${firstTry.error?.message ?? 'stored'} / ${secondTry.error?.message ?? 'stored'}`,
  'stored / stored',
);

await root.storage
  .from('photos')
  .remove([
    LOGO,
    `${NOT_YET}/profile.png`,
    `${MEMBER}/${PROBE}`,
    `${MEMBER}/too-large.png`,
    `${MEMBER}/not-a-photo.heic`,
    `${MEMBER}/fits.png`,
  ]);
await root.from('members').delete().in('id', [ADMIN, MEMBER, OTHER]);
console.log(failed ? `\n${failed} failed.\n` : '\nAll passed.\n');
process.exit(failed ? 1 : 0);
