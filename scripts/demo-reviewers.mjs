/**
 * Demo accounts for Apple and Google app reviewers.
 *
 *   node scripts/demo-reviewers.mjs            local stack, made-up @local.test addresses
 *   node scripts/demo-reviewers.mjs --reset    put the demo state back after a review
 *   node scripts/demo-reviewers.mjs --remove   delete every demo account and its content
 *   DEMO_REVIEWER_EMAIL=... DEMO_PEER_EMAIL=... DEMO_DELETE_EMAIL=... \
 *   DEMO_INVITE_EMAIL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/demo-reviewers.mjs --live [--reset]
 *
 * Makes Demo Reviewer and Demo Peer (finished profiles, email + password), one
 * direct conversation between them, a topic by Demo Peer in General, an
 * Interested RSVP to the next event, a third account (Demo Delete Me) to try
 * Me -> Account -> Delete on, and one pending invite for the Join path.
 * Running it again changes nothing that exists; it recreates what is missing,
 * so it also remakes Demo Delete Me after it was deleted. --reset also puts
 * profiles back and wipes the demo members' blocks, reports, conversations,
 * topics and RSVPs before making them again. A joined invite address is
 * deleted and invited again.
 *
 * Addresses: --reviewer-email, --peer-email, --delete-email, --invite-email, or
 * the DEMO_*_EMAIL variables. Required with --live (the invite address must be
 * an inbox somebody can open). Passwords: DEMO_REVIEWER_PASSWORD,
 * DEMO_PEER_PASSWORD, DEMO_DELETE_PASSWORD, else a random one is made when an
 * account is created and printed once, to a terminal only.
 * Other options: --mentor makes Demo Peer a mentor; DEMO_INVITER_ORG is the
 * organization short code the invites come from (default NCS).
 *
 * Local by default. --live needs SUPABASE_SERVICE_ROLE_KEY in the environment
 * (SUPABASE_URL defaults to the hosted project) and the project ref typed at
 * a prompt. Keys are never printed.
 *
 * Marks: usernames start "demo." and display names "Demo "; the accounts have
 * user_metadata.demo_account; invites carry NOTE. --remove looks for those.
 */

import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const LIVE_URL = 'https://erijdvqnxavwezsbbojv.supabase.co';
const LOCAL_URL = 'http://127.0.0.1:54321';
const NOTE = 'Demo account for store review (scripts/demo-reviewers.mjs)';
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ------------------------------------------------------------------ options
const flags = new Set();
const values = {};
for (const arg of process.argv.slice(2)) {
  const [name, ...rest] = arg.split('=');
  if (!name.startsWith('--')) fail(`Unexpected argument "${arg}". See the top of this file.`);
  if (rest.length) values[name.slice(2)] = rest.join('=');
  else flags.add(name.slice(2));
}
const KNOWN_FLAGS = ['live', 'reset', 'remove', 'mentor', 'help'];
const KNOWN_VALUES = ['reviewer-email', 'peer-email', 'delete-email', 'invite-email'];
for (const flag of flags) if (!KNOWN_FLAGS.includes(flag)) fail(`Unknown option --${flag}.`);
for (const name of Object.keys(values)) {
  if (!KNOWN_VALUES.includes(name)) fail(`Unknown option --${name}.`);
}
if (flags.has('help')) {
  console.log('See the comment at the top of scripts/demo-reviewers.mjs.');
  process.exit(0);
}
const live = flags.has('live');
const reset = flags.has('reset');
const remove = flags.has('remove');
if (reset && remove) fail('Use --reset or --remove, not both.');

// ------------------------------------------------------------- where and how
const URL_ = (process.env.SUPABASE_URL ?? (live ? LIVE_URL : LOCAL_URL)).replace(/\/+$/, '');
const isLocalUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(URL_);
if (live && isLocalUrl) fail('--live was given but SUPABASE_URL is the local stack. Drop one.');
if (!live && !isLocalUrl) {
  fail(`Refusing to touch ${URL_} without --live. Unset SUPABASE_URL to use the local stack.`);
}

function serviceKey() {
  if (live) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) fail('Set SUPABASE_SERVICE_ROLE_KEY in the environment (not in a file).');
    return key;
  }
  // Locally the stack's own key, so a hosted key left in the environment is
  // never what a local run uses.
  try {
    const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(out.slice(out.indexOf('{')));
    const key = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
    if (key) return key;
  } catch {
    // Fall through to the environment.
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) fail('Could not read the local key. Run `pnpm exec supabase start` first.');
  return key;
}

async function confirmLive() {
  const ref = new globalThis.URL(URL_).hostname.split('.')[0];
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('--live asks for a typed confirmation, so it needs a terminal.');
  }
  const what = remove
    ? 'DELETE the demo accounts and their content'
    : reset
      ? 'RESET the demo accounts (wipes their blocks, reports, conversations and topics)'
      : 'create the demo accounts and content';
  console.log(`\n  This will ${what} on the LIVE project ${ref}.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`  Type the project ref (${ref}) to go on: `);
  rl.close();
  if (typed.trim() !== ref) fail('Not confirmed. Nothing was changed.');
}

const KEY = serviceKey();
const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (!KEY.startsWith('sb_')) headers.Authorization = `Bearer ${KEY}`;

async function api(method, path, body, prefer) {
  const response = await fetch(`${URL_}${path}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok)
    fail(`${method} ${path.split('?')[0]} failed (${response.status}): ${text.slice(0, 300)}`);
  return parsed;
}

const rest = (method, table, query, body, prefer) =>
  api(method, `/rest/v1/${table}${query ? `?${query}` : ''}`, body, prefer);
const enc = encodeURIComponent;
const ids = (list) => `(${list.join(',')})`;

// ---------------------------------------------------------------- the people
const mentor = flags.has('mentor');
const local = (name) => `demo.${name}@local.test`;
const pick = (name, variable, fallback) => {
  const given = (values[`${name}-email`] ?? process.env[variable] ?? '').trim().toLowerCase();
  if (given) return given;
  if (live) fail(`Give the ${name} address: --${name}-email or ${variable}.`);
  return fallback;
};

const PEOPLE = [
  {
    key: 'reviewer',
    email: pick('reviewer', 'DEMO_REVIEWER_EMAIL', local('reviewer')),
    password: process.env.DEMO_REVIEWER_PASSWORD,
    member: {
      display_name: 'Demo Reviewer',
      username: 'demo.reviewer',
      type: 'peer',
      birth_date: '1986-03-14',
      city: 'San Jose',
      state: 'CA',
      level_range: 'T7–T12',
      exact_level: 'T10',
      injury_type: 'low_para',
      completeness: 'Incomplete',
      injury_date: '2014-06-01',
      injury_date_precision: 'month',
      gender: 'Prefer not to say',
      languages: ['English'],
      bio: 'Demo account for app store reviewers, not a real member. I like cooking and long train rides.',
      how_injured: 'A fall from a ladder. This is a demo account with invented details.',
      topics: ['Independent living', 'Travel'],
      marital_status: 'Single',
      has_children: false,
      independence: 'Completely independent',
      employment: 'Full time',
      education: "Bachelor's degree",
      education_when: 'Before',
      field_of_work: 'Office administration',
      interests: ['Reading', 'Cooking'],
      sports_equipment: 'None',
      grants: 'None',
      self_care: ['Intermittent catheter'],
      wants_to_mentor: false,
      show_in_browse: true,
    },
  },
  {
    key: 'peer',
    email: pick('peer', 'DEMO_PEER_EMAIL', local('peer')),
    password: process.env.DEMO_PEER_PASSWORD,
    member: {
      display_name: 'Demo Peer',
      username: 'demo.peer',
      type: mentor ? 'mentor' : 'peer',
      birth_date: '1979-11-02',
      city: 'Sacramento',
      state: 'CA',
      level_range: 'C5–C8',
      exact_level: 'C6',
      injury_type: 'quad',
      completeness: 'Complete',
      injury_date: '2009-01-01',
      injury_date_precision: 'year',
      gender: 'Prefer not to say',
      languages: ['English', 'Spanish'],
      bio: 'Demo account for app store reviewers, not a real member. I design posters and ride a hand cycle.',
      how_injured: 'A diving accident. This is a demo account with invented details.',
      topics: ['Adaptive sports', 'Driving & hand controls'],
      marital_status: 'Married or partnered',
      has_children: false,
      independence: 'Mostly independent',
      employment: 'Part time',
      education: 'Some college',
      education_when: 'After',
      field_of_work: 'Graphic design',
      interests: ['Music', 'Photography'],
      sports_equipment: 'A hand cycle',
      grants: 'None',
      self_care: ['Suprapubic catheter'],
      wants_to_mentor: mentor,
      show_in_browse: true,
    },
  },
  {
    key: 'delete',
    email: pick('delete', 'DEMO_DELETE_EMAIL', local('delete')),
    password: process.env.DEMO_DELETE_PASSWORD,
    member: {
      display_name: 'Demo Delete Me',
      username: 'demo.deleteme',
      type: 'peer',
      birth_date: '1990-07-25',
      city: 'Oakland',
      state: 'CA',
      level_range: 'L1–S5',
      exact_level: 'L2',
      injury_type: 'low_para',
      completeness: 'Incomplete',
      injury_date: '2018-09-01',
      injury_date_precision: 'month',
      gender: 'Prefer not to say',
      languages: ['English'],
      bio: 'Demo account for app store reviewers, not a real member. Delete it to see how deletion works.',
      how_injured: 'A demo account for trying account deletion. The details are invented.',
      topics: ['Newly injured'],
      marital_status: 'Single',
      has_children: false,
      independence: 'Completely independent',
      employment: 'Student',
      education: 'In progress',
      education_when: 'After',
      field_of_work: 'Not working yet',
      interests: ['Reading'],
      sports_equipment: 'None',
      grants: 'None',
      self_care: ['Intermittent catheter'],
      wants_to_mentor: false,
      show_in_browse: false,
    },
  },
];
const [reviewer, peer] = PEOPLE;
const inviteEmail = pick('invite', 'DEMO_INVITE_EMAIL', local('invitee'));

const everyEmail = [...PEOPLE.map((p) => p.email), inviteEmail];
for (const email of everyEmail) {
  if (!EMAIL_SHAPE.test(email) || email.length > 254)
    fail(`"${email}" does not look like an email address.`);
}
if (new Set(everyEmail).size !== everyEmail.length)
  fail('The four addresses must all be different.');
for (const person of PEOPLE) {
  // Declined, not a face: a demo account has no photograph of anybody.
  person.member.declined = ['photo'];
  person.member.status = 'active';
}

// ------------------------------------------------------------------ accounts
async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const body = await api('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
    const hit = body.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit;
    if (body.users.length < 200) return null;
  }
}

const isDemoUser = (user) => user?.user_metadata?.demo_account === true;

async function inviterOrganization() {
  const code = (process.env.DEMO_INVITER_ORG ?? 'NCS').trim();
  const [org] = await rest('GET', 'organizations', `short_code=eq.${enc(code)}&select=id`);
  if (!org) fail(`No organization has the short code "${code}" (DEMO_INVITER_ORG).`);
  return org.id;
}

async function ensureInvite(email, orgId) {
  const live_ = await rest(
    'GET',
    'invites',
    `email=eq.${enc(email)}&status=in.(pending,consumed)&select=id,status,note`,
  );
  if (live_.length) return live_[0];
  const [made] = await rest(
    'POST',
    'invites',
    undefined,
    { email, status: 'pending', invited_by_organization_id: orgId, note: NOTE },
    'return=representation',
  );
  return made;
}

const generated = [];
function newPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const groups = Array.from({ length: 4 }, () =>
      Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''),
    );
    const password = groups.join('-');
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) return password;
  }
}

async function ensureAccount(person, orgId) {
  const { email, member } = person;
  const existing = await findUser(email);
  if (existing && !isDemoUser(existing)) {
    fail(`${email} already has an account that is not a demo account. Choose another address.`);
  }
  const taken = await rest('GET', 'members', `username=eq.${enc(member.username)}&select=id`);
  if (taken.length && (!existing || taken[0].id !== existing.id)) {
    fail(`The username ${member.username} belongs to somebody else. Rename them first.`);
  }

  let user = existing;
  let created = false;
  if (!user) {
    if (!person.password && !process.stdout.isTTY) {
      fail(
        `${email} needs a password and this output is not a terminal. Set DEMO_${person.key.toUpperCase()}_PASSWORD.`,
      );
    }
    const password = person.password || newPassword();
    await ensureInvite(email, orgId);
    user = await api('POST', '/auth/v1/admin/users', {
      email,
      password,
      email_confirm: true,
      user_metadata: { demo_account: true, full_name: member.display_name },
    });
    if (!person.password) generated.push({ label: member.display_name, email, password });
    created = true;
  } else if (person.password) {
    await api('PUT', `/auth/v1/admin/users/${user.id}`, { password: person.password });
  }
  person.id = user.id;

  const [row] = await rest('GET', 'members', `id=eq.${user.id}&select=id`);
  if (!row) {
    await ensureInvite(email, orgId);
    await rest('POST', 'members', undefined, { id: user.id, ...member });
    person.state = created ? 'created' : 'member row remade';
  } else if (reset) {
    await rest('PATCH', 'members', `id=eq.${user.id}`, member);
    person.state = 'reset';
  } else {
    person.state = 'already there';
  }
}

// ------------------------------------------------------------------- content
async function wipeContent(memberIds) {
  if (!memberIds.length) return;
  const list = ids(memberIds);
  const gone = {};
  const del = async (label, table, query) => {
    const rows = await rest('DELETE', table, query, undefined, 'return=representation');
    gone[label] = (gone[label] ?? 0) + rows.length;
  };
  await del('reports', 'chat_reports', `or=(reporter_id.in.${list},reported_author_id.in.${list})`);
  await del('blocks', 'member_blocks', `or=(blocker_id.in.${list},blocked_id.in.${list})`);
  await del('strikes', 'member_strikes', `member_id=in.${list}`);
  await del('RSVPs', 'event_rsvps', `member_id=in.${list}`);

  // A conversation goes only if nobody outside the demo accounts is in it.
  const mine = await rest('GET', 'chat_thread_members', `member_id=in.${list}&select=thread_id`);
  const threadIds = [...new Set(mine.map((r) => r.thread_id))];
  if (threadIds.length) {
    const everyone = await rest(
      'GET',
      'chat_thread_members',
      `thread_id=in.${ids(threadIds)}&select=thread_id,member_id`,
    );
    const outsiders = new Set(
      everyone.filter((r) => !memberIds.includes(r.member_id)).map((r) => r.thread_id),
    );
    const wholly = threadIds.filter((id) => !outsiders.has(id));
    if (wholly.length) await del('conversations', 'chat_threads', `id=in.${ids(wholly)}`);
  }
  await del('topics', 'chat_topics', `author_id=in.${list}`);
  await del('replies', 'chat_posts', `author_id=in.${list}`);
  await del('messages', 'chat_messages', `author_id=in.${list}`);
  await del('notifications', 'notifications', `member_id=in.${list}`);
  return gone;
}

const TOPIC_TITLE = 'Hello from the demo accounts';
const TOPIC_BODY =
  'This topic belongs to a demo account used for app store review. Reply, like or report it to try those.';
const MESSAGES = [
  [
    'peer',
    'Hi, this is a sample conversation for app reviewers. Use the ••• on this message to try Report.',
  ],
  ['reviewer', 'Thanks, I will try Report and Block on one of your messages.'],
  ['peer', 'Sounds good. Blocking me hides my messages and ends the conversation.'],
];

async function ensureContent() {
  const [a, b] = [reviewer.id, peer.id];
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const done = [];

  let [thread] = await rest('GET', 'chat_threads', `direct_key=eq.${key}&select=id`);
  if (!thread) {
    [thread] = await rest(
      'POST',
      'chat_threads',
      undefined,
      { kind: 'direct', direct_key: key, created_by: a },
      'return=representation',
    );
    await rest('POST', 'chat_thread_members', undefined, [
      { thread_id: thread.id, member_id: a },
      { thread_id: thread.id, member_id: b },
    ]);
  }
  const said = await rest('GET', 'chat_messages', `thread_id=eq.${thread.id}&select=id&limit=1`);
  if (!said.length) {
    // One at a time, so their order is the order they were written.
    for (const [who, body] of MESSAGES) {
      const author = who === 'peer' ? b : a;
      await rest('POST', 'chat_messages', undefined, {
        thread_id: thread.id,
        author_id: author,
        body,
      });
    }
    done.push('conversation');
  }

  const [topic] = await rest(
    'GET',
    'chat_topics',
    `author_id=eq.${b}&room_id=eq.general&title=eq.${enc(TOPIC_TITLE)}&select=id`,
  );
  if (!topic) {
    const [made] = await rest(
      'POST',
      'chat_topics',
      undefined,
      { room_id: 'general', title: TOPIC_TITLE, author_id: b },
      'return=representation',
    );
    await rest('POST', 'chat_posts', undefined, {
      topic_id: made.id,
      author_id: b,
      body: TOPIC_BODY,
    });
    done.push('topic');
  }

  const [event] = await rest(
    'GET',
    'events',
    `start_time=gt.${enc(new Date().toISOString())}&select=id,title&order=start_time.asc&limit=1`,
  );
  if (!event) {
    done.push('no upcoming event, so no RSVPs');
  } else {
    for (const who of [a, b]) {
      const [have] = await rest(
        'GET',
        'event_rsvps',
        `event_id=eq.${event.id}&member_id=eq.${who}&select=id`,
      );
      // Interested, not Going: Going hands the member's email to the event's host.
      if (!have) {
        await rest('POST', 'event_rsvps', undefined, {
          event_id: event.id,
          member_id: who,
          status: 'interested',
        });
        done.push(`RSVP (${event.title})`);
      }
    }
  }
  return done;
}

// ------------------------------------------------- the address to join with
async function removeUser(user) {
  await api('DELETE', `/auth/v1/admin/users/${user.id}`);
  await rest('DELETE', 'members', `id=eq.${user.id}`);
}

async function ensureInviteAddress(orgId) {
  const user = await findUser(inviteEmail);
  const [invite] = await rest(
    'GET',
    'invites',
    `email=eq.${enc(inviteEmail)}&status=in.(pending,consumed)&select=id,status,note,claimed_by`,
  );
  const ours = invite?.note === NOTE;
  if (user && !ours && !isDemoUser(user)) {
    fail(
      `${inviteEmail} already has an account that is not from this script. Choose another invite address.`,
    );
  }
  if (!reset) {
    if (user) return 'already used: someone has an account here (--reset invites it again)';
    if (invite) return invite.status === 'pending' ? 'already invited' : 'invite already used';
    await ensureInvite(inviteEmail, orgId);
    return 'invited';
  }
  if (user) {
    await wipeContent([user.id]);
    await removeUser(user);
  }
  await rest('DELETE', 'invites', `email=eq.${enc(inviteEmail)}&note=eq.${enc(NOTE)}`);
  await ensureInvite(inviteEmail, orgId);
  return user ? 'account removed, invited again' : 'invited';
}

// -------------------------------------------------------------------- remove
async function removeEverything() {
  const found = [];
  for (const person of PEOPLE) {
    const [row] = await rest(
      'GET',
      'members',
      `username=eq.${enc(person.member.username)}&select=id`,
    );
    const user = row
      ? await api('GET', `/auth/v1/admin/users/${row.id}`)
      : await findUser(person.email);
    if (user && isDemoUser(user)) found.push(user);
    else if (row) console.log(`  ${person.member.username} is not a demo account; left alone`);
  }
  const joined = await rest(
    'GET',
    'invites',
    `note=eq.${enc(NOTE)}&claimed_by=not.is.null&select=claimed_by`,
  );
  for (const { claimed_by: id } of joined) {
    if (!found.some((u) => u.id === id)) found.push({ id });
  }
  const gone = await wipeContent(found.map((u) => u.id));
  for (const user of found) await removeUser(user);
  const invites = await rest(
    'DELETE',
    'invites',
    `note=eq.${enc(NOTE)}`,
    undefined,
    'return=representation',
  );
  console.log(`  Removed ${found.length} account(s), ${invites.length} invite(s).`);
  if (gone) console.log(`  Content removed: ${JSON.stringify(gone)}`);
}

// ----------------------------------------------------------------------- run
if (live) await confirmLive();

if (remove) {
  await removeEverything();
  process.exit(0);
}

const orgId = await inviterOrganization();

if (reset) {
  const existing = [];
  for (const person of PEOPLE) {
    const user = await findUser(person.email);
    if (user && isDemoUser(user)) existing.push(user.id);
  }
  const gone = await wipeContent(existing);
  console.log(`  Reset: wiped ${JSON.stringify(gone ?? {})}`);
}

for (const person of PEOPLE) await ensureAccount(person, orgId);
const content = await ensureContent();
const invited = await ensureInviteAddress(orgId);

console.log(`\n  ${live ? 'LIVE' : 'Local'} demo accounts`);
for (const person of PEOPLE) {
  console.log(
    `  ${person.member.display_name.padEnd(15)} ${person.email}  (${person.member.username}) ${person.state}`,
  );
}
console.log(`  Content made: ${content.length ? content.join(', ') : 'nothing new'}`);
console.log(`  Invite address ${inviteEmail}: ${invited}`);
if (generated.length) {
  console.log('\n  New passwords (shown once, not stored anywhere):');
  for (const g of generated) console.log(`  ${g.label.padEnd(15)} ${g.password}`);
}
console.log('');
