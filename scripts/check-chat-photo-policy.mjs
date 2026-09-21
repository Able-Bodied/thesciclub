/**
 * Who can put a photograph in a conversation, who can see it, and who can take
 * it down — through the storage API, which is the only path that governs it.
 *
 *   pnpm exec supabase start …   # a local stack with storage-api running
 *   pnpm check-chat-photo-policy
 *
 * The other half of supabase/tests/chat-attachments.sql. That file settles
 * what SQL can — the row constraints and the *read* policy — and cannot touch
 * uploads or deletes: `storage.protect_delete()` refuses every direct delete
 * before RLS is consulted, and an insert into storage.objects as a member does
 * not pass through the API's own size and mime checks. So those come here,
 * with real tokens, the way the app does them. See scripts/check-photo-policy.mjs
 * for the harness and for why the per-member clients use the anon key.
 */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SERVICE || !ANON) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (pnpm exec supabase status).');
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

const ADMIN = 'aaaaaaaa-5555-0000-0000-00000000000a';
const SENDER = 'bbbbbbbb-5555-0000-0000-00000000000b';
const RECEIVER = 'cccccccc-5555-0000-0000-00000000000c';
const STRANGER = 'dddddddd-5555-0000-0000-00000000000d';

const root = createClient(API, SERVICE, { auth: { persistSession: false } });
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
  phone: `1998000${Math.floor(Math.random() * 9000 + 1000)}`,
  birth_date: '1980-01-01',
  level_range: 'T1–T6',
  state: 'CA',
  is_admin: admin,
});

async function requireStorage() {
  const probe = await root.storage.from('chat').list('', { limit: 1 });
  if (!probe.error) return;
  console.error(`\n  Storage is not reachable: ${probe.error.message}`);
  console.error('  The local stack is probably running with -x storage-api. Restart it without.\n');
  process.exit(2);
}

let failed = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
};

// A real, tiny webp so the mime check is about the type header and not about
// the bytes being nonsense.
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

await requireStorage();

const ids = [ADMIN, SENDER, RECEIVER, STRANGER];
await root.from('members').delete().in('id', ids);
await root
  .from('members')
  .insert([
    member(ADMIN, 'Policy Admin', true),
    member(SENDER, 'Policy Sender', false),
    member(RECEIVER, 'Policy Receiver', false),
    member(STRANGER, 'Policy Stranger', false),
  ]);

// A direct conversation between Sender and Receiver, opened the way the app
// opens one, as Sender.
const opened = await as(SENDER).rpc('chat_open_direct', { other: RECEIVER });
if (opened.error || !opened.data) {
  console.error(`Could not open the conversation: ${opened.error?.message}`);
  process.exit(1);
}
const dm = opened.data;
const path = `threads/${dm}/probe.webp`;
const exists = async () => {
  const { data } = await root.storage.from('chat').list(`threads/${dm}`);
  return (data ?? []).some((o) => o.name === 'probe.webp');
};
const canRead = async (who) => {
  const { data } = await as(who).storage.from('chat').createSignedUrl(path, 60);
  return Boolean(data?.signedUrl);
};

console.log('\nChat photographs, through the storage API:\n');

const up = await as(SENDER).storage.from('chat').upload(path, WEBP, { contentType: 'image/webp' });
check('a member of the conversation can upload into it', up.error === null, true);

const strangerUp = await as(STRANGER)
  .storage.from('chat')
  .upload(`threads/${dm}/stranger.webp`, WEBP, { contentType: 'image/webp' });
check('somebody outside it cannot upload into it', strangerUp.error !== null, true);

const text = await as(SENDER)
  .storage.from('chat')
  .upload(`threads/${dm}/notes.txt`, Buffer.from('x'), { contentType: 'text/plain' });
check('a file that is not a photograph is refused by the bucket', text.error !== null, true);

const big = await as(SENDER)
  .storage.from('chat')
  .upload(`threads/${dm}/big.webp`, Buffer.alloc(2 * 1024 * 1024 + 1, 1), {
    contentType: 'image/webp',
  });
check('a file over the bucket limit is refused by the bucket', big.error !== null, true);

check('the receiver can read it', await canRead(RECEIVER), true);
check('*** somebody outside the conversation cannot ***', await canRead(STRANGER), false);
check('an administrator, not in the conversation, cannot either', await canRead(ADMIN), false);
check(
  'a signed-out visitor cannot',
  Boolean(
    (await createClient(API, ANON).storage.from('chat').createSignedUrl(path, 60)).data?.signedUrl,
  ),
  false,
);

await as(RECEIVER).storage.from('chat').remove([path]);
check("the receiver cannot delete the sender's photograph", await exists(), true);

await as(SENDER).storage.from('chat').remove([path]);
check('the sender can delete their own', await exists(), false);

// Not a gap: the storage API deletes only what the caller can select, and an
// administrator cannot select a picture in a conversation they are not in. A
// removed member's photographs therefore stay, the way their words do; see
// 20260918200000. This step is here so that nobody "fixes" it by widening
// the select policy — which would let an administrator read the picture.
await as(SENDER).storage.from('chat').upload(path, WEBP, { contentType: 'image/webp' });
await as(ADMIN).storage.from('chat').remove([path]);
check('an administrator cannot delete what they cannot read', await exists(), true);
await root.storage.from('chat').remove([path]);

// Tidy up: the conversation, its roster and the members. Files are gone.
await root.from('chat_threads').delete().eq('id', dm);
await root.from('members').delete().in('id', ids);
console.log(failed ? `\n${failed} failed.\n` : '\nAll passed.\n');
process.exit(failed ? 1 : 0);
