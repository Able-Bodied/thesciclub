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
// Reported, then deleted: by themselves, and by an administrator.
const LEAVER = 'eeeeeeee-6666-0000-0000-00000000000e';
const REMOVED = 'ffffffff-6666-0000-0000-00000000000f';

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

await root.from('chat_reports').delete().eq('reporter_id', OTHER);
await root.from('members').delete().in('id', [ADMIN, MEMBER, OTHER, LEAVER, REMOVED]);
await root.auth.admin.deleteUser(LEAVER);
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
// The closed door shows organization logos even before sign-in (20261012050000).
check('…but can read an organization logo', await signs(createClient(API, ANON), LOGO), true);
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

/**
 * A profile photograph named on a report (20261022130000) cannot be deleted or
 * overwritten, by the member or by an administrator, and the Storage API says
 * nothing when it skips it. A photograph nobody reported still can be.
 */
console.log('\nA reported profile photograph is kept:\n');

const REPORTED = `${MEMBER}/reported.png`;
const UNREPORTED = `${MEMBER}/unreported.png`;
for (const path of [REPORTED, UNREPORTED]) {
  const { error } = await root.storage
    .from('photos')
    .upload(path, PNG, { upsert: true, contentType: 'image/png' });
  if (error) {
    console.error(`\n  Could not put ${path} in place: ${error.message}\n`);
    process.exit(2);
  }
}
await root.from('members').update({ photo_path: REPORTED }).eq('id', MEMBER);
const reported = await as(OTHER).rpc('report_member', { member: MEMBER, report_note: null });
if (reported.error) {
  console.error(`\n  Could not report the profile: ${reported.error.message}\n`);
  process.exit(2);
}
const has = async (name) =>
  ((await root.storage.from('photos').list(MEMBER)).data ?? []).some((o) => o.name === name);

await as(MEMBER).storage.from('photos').remove([REPORTED]);
check('the member cannot delete the photograph named on a report', await has('reported.png'), true);

await as(ADMIN).storage.from('photos').remove([REPORTED]);
check('nor can an administrator', await has('reported.png'), true);

const overwrite = await as(MEMBER)
  .storage.from('photos')
  .upload(REPORTED, Buffer.concat([PNG, Buffer.alloc(8)]), {
    upsert: true,
    contentType: 'image/png',
  });
check('nor overwrite it', overwrite.error !== null, true);

const fresh = await as(MEMBER)
  .storage.from('photos')
  .upload(`${MEMBER}/fresh.png`, PNG, { upsert: true, contentType: 'image/png' });
check('a new photograph under a new name is stored', fresh.error?.code ?? 'stored', 'stored');

await as(MEMBER)
  .storage.from('photos')
  .remove([UNREPORTED, `${MEMBER}/fresh.png`]);
check('a photograph nobody reported can still be deleted', await has('unreported.png'), false);
check('a member can still delete their new one', await has('fresh.png'), false);

check(
  'an administrator can still open the reported photograph',
  await signs(as(ADMIN), REPORTED),
  true,
);

/**
 * Once a reported member's account is deleted (20261022150000), the report
 * forgets the photograph and the file goes like their others: after
 * delete_my_account with the session it still holds (delete-account-api.ts),
 * or after admin_delete_member (members-admin.ts). Meanwhile Policy Member,
 * still reported and still a member, keeps the protection.
 */
console.log("\nA deleted member's reported photograph goes with the account:\n");

const folderHas = async (folder, name) =>
  ((await root.storage.from('photos').list(folder)).data ?? []).some((o) => o.name === name);
// A real sign-in account, so delete_my_account deletes one and the token outlives it.
{
  const { error } = await root.auth.admin.createUser({
    id: LEAVER,
    email: 'photo-policy-leaver@local.test',
    email_confirm: true,
  });
  if (error) {
    console.error(`\n  Could not create the leaver's account: ${error.message}\n`);
    process.exit(2);
  }
}
await root
  .from('members')
  .insert([member(LEAVER, 'Policy Leaver', false), member(REMOVED, 'Policy Removed', false)]);
for (const owner of [LEAVER, REMOVED]) {
  for (const name of ['reported.png', 'other.png']) {
    const { error } = await root.storage
      .from('photos')
      .upload(`${owner}/${name}`, PNG, { upsert: true, contentType: 'image/png' });
    if (error) {
      console.error(`\n  Could not put ${owner}/${name} in place: ${error.message}\n`);
      process.exit(2);
    }
  }
  await root
    .from('members')
    .update({ photo_path: `${owner}/reported.png` })
    .eq('id', owner);
  const filed = await as(OTHER).rpc('report_member', { member: owner, report_note: owner });
  if (filed.error) {
    console.error(`\n  Could not report ${owner}: ${filed.error.message}\n`);
    process.exit(2);
  }
}
const clearFolder = async (client, folder) => {
  const { data } = await client.storage.from('photos').list(folder);
  const paths = (data ?? []).map((o) => `${folder}/${o.name}`);
  if (paths.length > 0) await client.storage.from('photos').remove(paths);
};
const copyOf = async (owner) =>
  (await root.from('chat_reports').select('profile_snapshot, profile_photo_path').eq('note', owner))
    .data?.[0];

// The member's own deletion: the folder, the account, the folder again.
check(
  'the leaver has a sign-in account',
  (await root.auth.admin.getUserById(LEAVER)).data?.user?.id,
  LEAVER,
);
const leaver = as(LEAVER);
await clearFolder(leaver, LEAVER);
check(
  'before deleting, the reported photograph stays',
  await folderHas(LEAVER, 'reported.png'),
  true,
);
check('…and their other photograph goes', await folderHas(LEAVER, 'other.png'), false);
const deleted = await leaver.rpc('delete_my_account');
check('delete_my_account', deleted.error?.message ?? 'deleted', 'deleted');
check(
  'their sign-in account is gone',
  (await root.auth.admin.getUserById(LEAVER)).data?.user ?? null,
  null,
);
await clearFolder(leaver, LEAVER);
check(
  'then the same session deletes the reported photograph',
  await folderHas(LEAVER, 'reported.png'),
  false,
);
const leaverCopy = await copyOf(LEAVER);
check(
  'the copy reads Deleted member, no @username, no photograph',
  `${leaverCopy?.profile_snapshot?.display_name} ${leaverCopy?.profile_snapshot?.username} ${leaverCopy?.profile_photo_path}`,
  'Deleted member undefined null',
);

// An administrator's Remove: the account, then the folder.
await as(ADMIN)
  .storage.from('photos')
  .remove([`${REMOVED}/reported.png`]);
check(
  'before removing them, an administrator cannot delete it',
  await folderHas(REMOVED, 'reported.png'),
  true,
);
const removed = await as(ADMIN).rpc('admin_delete_member', { target: REMOVED });
check('admin_delete_member', removed.error?.message ?? 'removed', 'removed');
await clearFolder(as(ADMIN), REMOVED);
check(
  'then the administrator deletes the reported photograph',
  await folderHas(REMOVED, 'reported.png'),
  false,
);
check('…and the other', await folderHas(REMOVED, 'other.png'), false);
const removedCopy = await copyOf(REMOVED);
check(
  'the copy reads Deleted member, no @username, no photograph',
  `${removedCopy?.profile_snapshot?.display_name} ${removedCopy?.profile_snapshot?.username} ${removedCopy?.profile_photo_path}`,
  'Deleted member undefined null',
);

// Policy Member is still here and still reported.
await as(MEMBER).storage.from('photos').remove([REPORTED]);
await as(ADMIN).storage.from('photos').remove([REPORTED]);
check("a still-member's reported photograph is still kept", await has('reported.png'), true);

// Reports keep their rows when a member goes: clear them first.
await root.from('chat_reports').delete().eq('reporter_id', OTHER);
await root.storage.from('photos').remove([REPORTED]);

await root.storage
  .from('photos')
  .remove([
    LOGO,
    `${NOT_YET}/profile.png`,
    `${MEMBER}/${PROBE}`,
    `${MEMBER}/too-large.png`,
    `${MEMBER}/not-a-photo.heic`,
    `${MEMBER}/fits.png`,
    ...[LEAVER, REMOVED].flatMap((o) => [`${o}/reported.png`, `${o}/other.png`]),
  ]);
await root.from('members').delete().in('id', [ADMIN, MEMBER, OTHER, LEAVER, REMOVED]);
await root.auth.admin.deleteUser(LEAVER);
console.log(failed ? `\n${failed} failed.\n` : '\nAll passed.\n');
process.exit(failed ? 1 : 0);
