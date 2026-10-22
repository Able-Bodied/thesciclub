/**
 * Re-fit the photographs that were uploaded before src/lib/image.ts existed.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm reprocess-photos [--dry-run]
 *
 * With --thumbs, instead: make the small copy (`prepareThumb`) beside every
 * member photograph that has none, as an upload now does (2026-10-22). It
 * only adds files; no row changes. Safe to run again.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm reprocess-photos --thumbs [--dry-run]
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
const THUMBS = process.argv.includes('--thumbs');

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

// Only a photograph in the member's own folder, in the shape the app uploads
// (private.photo_path_is_own, 20261018000000). photo_path was written by the
// member, and before that migration it could name anybody's file: this script
// would have copied it into their profile and then deleted the original.
const OWN_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$/;
const own = (m) => OWN_PATH.test(m.photo_path) && m.photo_path.startsWith(`${m.id}/`);
for (const m of members.filter((m) => !own(m))) {
  console.log(`  ${m.display_name}: ${m.photo_path} is not in their own folder; left alone`);
}

if (THUMBS) {
  await makeThumbs(members.filter(own));
  process.exit(0);
}

/** The small copies, made by the app's own code in a page (see above). */
async function makeThumbs(list) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/join`, { waitUntil: 'domcontentloaded' });
  let made = 0;
  for (const m of list) {
    const thumb = await page.evaluate(async (path) => {
      const { thumbPath } = await import('/src/lib/photos.ts');
      return thumbPath(path);
    }, m.photo_path);
    const listed = await db.storage.from('photos').list(m.id);
    if (listed.data?.some((o) => `${m.id}/${o.name}` === thumb)) continue;
    const full = await db.storage.from('photos').download(m.photo_path);
    if (full.error) {
      console.log(`  ${m.display_name}: could not fetch ${m.photo_path} (${full.error.message})`);
      continue;
    }
    const bytes = Buffer.from(await full.data.arrayBuffer());
    const small = await page.evaluate(
      async ([data, type]) => {
        const { prepareThumb } = await import('/src/lib/image.ts');
        const blob = await prepareThumb(new Blob([new Uint8Array(data)], { type }));
        return blob
          ? { bytes: [...new Uint8Array(await blob.arrayBuffer())], type: blob.type }
          : null;
      },
      [[...bytes], full.data.type],
    );
    if (!small) {
      console.log(`  ${m.display_name}: no copy (already small, or not webp or JPEG)`);
      continue;
    }
    console.log(
      `  ${m.display_name}: ${thumb} ${Math.round(small.bytes.length / 1024)}KB (photograph ${Math.round(bytes.length / 1024)}KB)`,
    );
    if (DRY) continue;
    const up = await db.storage
      .from('photos')
      .upload(thumb, Buffer.from(small.bytes), { upsert: false, contentType: small.type });
    if (up.error) console.log(`    upload failed: ${up.error.message}`);
    else made += 1;
  }
  await browser.close();
  console.log(DRY ? 'Dry run — nothing written.' : `Done. ${made} small copies made.`);
}

// Seeded photographs were fitted when they were imported and are already webp.
const todo = members.filter((m) => own(m) && !m.photo_path.endsWith('.webp'));
console.log(`${members.length} photographs, ${todo.length} not yet fitted.`);
if (todo.length === 0) process.exit(0);

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/join`, { waitUntil: 'domcontentloaded' });

let changed = 0;
for (const m of todo) {
  // Through the storage API with the service key, not the public URL: the
  // bucket is private from HANDOFF.md "What Home is" step 6, and a public URL to it 400s.
  const before = await db.storage.from('photos').download(m.photo_path);
  if (before.error) {
    console.log(`  ${m.display_name}: could not fetch ${m.photo_path} (${before.error.message})`);
    continue;
  }
  const originalBytes = Buffer.from(await before.data.arrayBuffer());

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
