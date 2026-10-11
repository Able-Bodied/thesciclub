/**
 * Sets a confirmed email address on an existing member's account.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-member-email.mjs <member id | display name> <email>
 *
 * For people who cannot get to Me to add their own: the owner's account, an
 * administrator who is signed out. The account, its admin rights, posts and
 * chats stay as they are; it gains an address it can sign in with (Google with
 * that address, or Forgot password). The address is marked confirmed, because
 * the owner is vouching for it here.
 *
 * The service key comes from the environment and is never written anywhere.
 * SUPABASE_URL defaults to the live project; point it at http://127.0.0.1:54321
 * to try this on the local stack.
 */

const SUPABASE_URL = (
  process.env.SUPABASE_URL ?? 'https://erijdvqnxavwezsbbojv.supabase.co'
).replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [who, rawEmail] = process.argv.slice(2);
if (!who || !rawEmail) {
  fail('Usage: node scripts/set-member-email.mjs <member id | display name> <email>');
}
if (!SERVICE_KEY) fail('Set SUPABASE_SERVICE_ROLE_KEY in the environment (not in a file).');
const email = rawEmail.trim().toLowerCase();
if (!EMAIL.test(email) || email.length > 254)
  fail(`"${rawEmail}" does not look like an email address.`);

const headers = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;

async function call(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    fail(`${options.method ?? 'GET'} ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return body;
}

// Find the member: an exact id, or a display name that must match exactly one.
const filter = UUID.test(who)
  ? `id=eq.${who}`
  : `display_name=ilike.${encodeURIComponent(who.replace(/[%_*\\]/g, ''))}`;
const members = await call(`/rest/v1/members?select=id,display_name,is_admin&${filter}`);
if (members.length === 0) fail(`No member matches "${who}".`);
if (members.length > 1) {
  fail(
    `More than one member is called "${who}". Use an id:\n${members
      .map((m) => `  ${m.id}  ${m.display_name}`)
      .join('\n')}`,
  );
}
const member = members[0];

const { user_metadata: _meta, ...account } = await call(`/auth/v1/admin/users/${member.id}`);
console.log(
  `${member.display_name}${member.is_admin ? ' (admin)' : ''}: ${account.email || '(no email)'} -> ${email}`,
);

await call(`/auth/v1/admin/users/${member.id}`, {
  method: 'PUT',
  body: JSON.stringify({ email, email_confirm: true }),
});
console.log(
  'Done. The address is confirmed. They can sign in with Google or Forgot password using it.',
);
