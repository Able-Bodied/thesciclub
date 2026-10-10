/**
 * Deletes the seeded directory's photographs (photos/seed/*), after
 * 20261010020000 has removed the rows that used them.
 *
 *   node scripts/remove-seed-photos.mjs            lists what would go
 *   node scripts/remove-seed-photos.mjs --delete   deletes it
 *
 * Through the Storage API with the service key from .env.local, as every
 * deletion from a bucket must be (HANDOFF "Photos"). Refuses while any
 * member row still names a file under seed/, so it cannot run ahead of the
 * migration and leave profiles pointing at nothing.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => [
      line.slice(0, line.indexOf('=')).trim(),
      line.slice(line.indexOf('=') + 1).trim(),
    ]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error('.env.local needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');

const headers = { apikey: key, 'Content-Type': 'application/json' };
if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;

const stillUsed = await fetch(`${url}/rest/v1/members?select=id&photo_path=like.seed/*`, {
  headers,
});
const using = await stillUsed.json();
if (!Array.isArray(using)) throw new Error(`Could not check members: ${JSON.stringify(using)}`);
if (using.length > 0) {
  throw new Error(
    `${using.length} member rows still use a seed/ photograph. Push 20261010020000 first.`,
  );
}

const listed = await fetch(`${url}/storage/v1/object/list/photos`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ prefix: 'seed', limit: 1000 }),
});
const files = (await listed.json()).map((file) => `seed/${file.name}`);
console.log(`${files.length} files under photos/seed/`);
if (!process.argv.includes('--delete')) {
  for (const file of files) console.log(`  ${file}`);
  console.log('Nothing deleted. Run again with --delete.');
  process.exit(0);
}
if (files.length === 0) process.exit(0);

const removed = await fetch(`${url}/storage/v1/object/photos`, {
  method: 'DELETE',
  headers,
  body: JSON.stringify({ prefixes: files }),
});
const result = await removed.json();
console.log(`Deleted ${Array.isArray(result) ? result.length : 0} of ${files.length}.`);
if (!removed.ok) throw new Error(JSON.stringify(result));
