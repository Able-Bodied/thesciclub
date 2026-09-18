/**
 * Re-fit the photographs that were uploaded before src/lib/image.ts existed.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm reprocess-photos [--dry-run]
 *
 * ---------------------------------------------------------------------------
 * Why it drives a browser
 * ---------------------------------------------------------------------------
 * There is no image library in this project and there should not be one for a
 * job that runs once. More importantly, a second implementation would *drift*:
 * the whole point is that these files end up identical to what an upload now
 * produces, and the only way to guarantee that is to run the same code. So this
 * loads `src/lib/image.ts` from the running dev server and calls `preparePhoto`
 * in a real canvas — the same rule `jobs/event-ingest/series.js` states about
 * never reimplementing the matcher in SQL.
 *
 * Needs `pnpm dev` running. SHOOT_BASE overrides the origin, as with pnpm shoot.
 *
 * ---------------------------------------------------------------------------
 * What it does to storage
 * ---------------------------------------------------------------------------
 * Uploads the fitted file at <id>/profile.webp, points `members.photo_path` at
 * it, and only then removes the original object. In that order: a member whose
 * row still points at the old path has a photograph, and one whose old file is
 * gone before the row moves has a broken image.
 */

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.SHOOT_BASE ?? 'http://localhost:5173';
const DRY = process.argv.includes('--dry-run');

if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const { data: members, error } = await db
  .from('members')
  .select('id, display_name, photo_path')
  .not('photo_path', 'is', null);
if (error) {
  console.error(error.message);
  process.exit(1);
}

// Seeded photographs were fitted when they were imported and are already webp.
const todo = members.filter((m) => !m.photo_path.endsWith('.webp'));
console.log(`${members.length} photographs, ${todo.length} not yet fitted.`);
if (todo.length === 0) process.exit(0);

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/join`, { waitUntil: 'domcontentloaded' });

let changed = 0;
for (const m of todo) {
  const from = `${URL_}/storage/v1/object/public/photos/${m.photo_path}`;
  const before = await fetch(from);
  if (!before.ok) {
    console.log(`  ${m.display_name}: could not fetch ${m.photo_path} (${before.status})`);
    continue;
  }
  const originalBytes = Buffer.from(await before.arrayBuffer());

  // preparePhoto, in the page, against the real module.
  const fitted = await page.evaluate(
    async ([bytes, name]) => {
      const { preparePhoto } = await import('/src/lib/image.ts');
      const file = new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
      const { blob, ext } = await preparePhoto(file);
      return { bytes: [...new Uint8Array(await blob.arrayBuffer())], ext, type: blob.type };
    },
    [[...originalBytes], m.photo_path.split('/').pop()],
  );

  const out = Buffer.from(fitted.bytes);
  const pct = Math.round((1 - out.length / originalBytes.length) * 100);
  console.log(
    `  ${m.display_name}: ${Math.round(originalBytes.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB (${pct}% smaller) .${fitted.ext}`,
  );

  if (fitted.ext !== 'webp') {
    console.log('    left alone — processing fell back to the original');
    continue;
  }
  if (DRY) continue;

  const next = `${m.id}/profile.webp`;
  const up = await db.storage
    .from('photos')
    .upload(next, out, { upsert: true, contentType: fitted.type });
  if (up.error) {
    console.log(`    upload failed: ${up.error.message}`);
    continue;
  }
  const moved = await db.from('members').update({ photo_path: next }).eq('id', m.id);
  if (moved.error) {
    console.log(`    row not updated: ${moved.error.message}`);
    continue;
  }
  // Only now. A row still pointing at the old path has a photograph; an old
  // file removed before the row moves leaves a broken image.
  if (m.photo_path !== next) await db.storage.from('photos').remove([m.photo_path]);
  changed += 1;
}

await browser.close();
console.log(DRY ? 'Dry run — nothing written.' : `Done. ${changed} refitted.`);
