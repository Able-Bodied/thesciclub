/**
 * The map's tiles, cut from a Protomaps planet build, and its glyphs and sprites.
 *
 *   pnpm map-tiles            us (the states, z7) and ca (California, z14) into
 *                             map-tiles-out/, for R2
 *   pnpm map-tiles --dev      us, and a Bay Area ca to z13, into public/tiles/ for `pnpm dev`
 *   pnpm map-tiles --latest   the newest build instead of TILES_BUILD in
 *                             src/lib/map/tiles.ts, which it then updates
 *   pnpm map-tiles --assets   only re-download public/map/v1 (glyphs, sprites)
 *   pnpm map-tiles --upload   only upload map-tiles-out/'s us and ca for TILES_BUILD to
 *                             R2 (scripts/r2-upload.mjs), skipping any already there.
 *                             Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY;
 *                             R2_BUCKET if not sciclub-tiles
 *   … --out=<dir>             somewhere else
 *
 * Only the byte ranges inside the boxes are downloaded, never the planet.
 * go-pmtiles is fetched once into ~/.cache/thesciclub-map, checked by hash.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { uploadFile } from './r2-upload.mjs';

const PMTILES_VERSION = '1.31.2';
// From the release's own digests (GitHub API, v1.31.2).
const PMTILES_RELEASES = {
  'linux-x64': [
    `go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz`,
    '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f',
  ],
  'linux-arm64': [
    `go-pmtiles_${PMTILES_VERSION}_Linux_arm64.tar.gz`,
    'f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1',
  ],
  'darwin-arm64': [
    `go-pmtiles-${PMTILES_VERSION}_Darwin_arm64.zip`,
    '40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d',
  ],
  'darwin-x64': [
    `go-pmtiles-${PMTILES_VERSION}_Darwin_x86_64.zip`,
    '1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b',
  ],
};

// basemaps-assets at a fixed commit (2025-10-31): fonts OFL, sprites MIT.
const ASSETS_COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const ASSETS = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${ASSETS_COMMIT}`;
// Keep in step with GLYPH_RANGES in src/lib/map/style.ts.
const FONT = 'Noto Sans Regular';
const GLYPH_RANGES = ['0-255', '256-511', '7680-7935', '8192-8447'];
const SPRITES = ['light', 'dark'];

const BUILDS = 'https://build-metadata.protomaps.dev/builds.json';
const BUILD_URL = (build) => `https://build.protomaps.com/${build}.pmtiles`;
const BUILD_FILE = 'src/lib/map/tiles.ts';
const BUILD_LINE = /TILES_BUILD = '(\d{8})'/;

// [west, south, east, north]; CALIFORNIA matches style.ts.
const CALIFORNIA = [-124.5, 32.5, -114.1, 42.05];
const BAY_AREA = [-122.6, 37.1, -121.6, 38.0];
// The states and Puerto Rico, not the whole of Canada and Mexico between them.
const UNITED_STATES = [
  [-125.0, 24.4, -66.9, 49.4],
  [-170.0, 51.2, -129.9, 71.4],
  [-160.3, 18.8, -154.7, 22.3],
  [-67.3, 17.9, -65.2, 18.6],
];

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const latest = args.includes('--latest');
const assetsOnly = args.includes('--assets');
const upload = args.includes('--upload');
// The full set stays out of public/, which every build copies.
const out =
  args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ??
  (dev ? 'public/tiles' : 'map-tiles-out');
const CACHE = path.join(homedir(), '.cache', 'thesciclub-map');

async function sha256(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

async function pmtilesBinary() {
  const release = PMTILES_RELEASES[`${process.platform}-${process.arch}`];
  if (!release)
    throw new Error(`No go-pmtiles named here for ${process.platform}-${process.arch}.`);
  const [name, hash] = release;
  const dir = path.join(CACHE, `go-pmtiles-${PMTILES_VERSION}`);
  const binary = path.join(dir, 'pmtiles');
  if (existsSync(binary)) return binary;
  await mkdir(dir, { recursive: true });
  const archive = path.join(dir, name);
  console.log(`Downloading ${name}`);
  await download(
    `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${name}`,
    archive,
  );
  if ((await sha256(archive)) !== hash) {
    await rm(archive);
    throw new Error(`${name} does not match its published hash.`);
  }
  if (name.endsWith('.zip')) execFileSync('unzip', ['-o', '-q', archive, 'pmtiles', '-d', dir]);
  else execFileSync('tar', ['-xzf', archive, '-C', dir, 'pmtiles']);
  await chmod(binary, 0o755);
  await rm(archive);
  return binary;
}

async function chooseBuild() {
  const source = await readFile(BUILD_FILE, 'utf8');
  const pinned = BUILD_LINE.exec(source)?.[1];
  if (!pinned) throw new Error(`No TILES_BUILD in ${BUILD_FILE}.`);
  if (!latest) return pinned;
  const builds = await (await fetch(BUILDS)).json();
  const newest = builds
    .map((b) => b.key.replace('.pmtiles', ''))
    .filter((key) => /^\d{8}$/.test(key))
    .sort()
    .at(-1);
  if (!newest) throw new Error('No builds listed.');
  if (newest !== pinned) {
    await writeFile(BUILD_FILE, source.replace(BUILD_LINE, `TILES_BUILD = '${newest}'`));
    console.log(`${BUILD_FILE}: ${pinned} -> ${newest}`);
  }
  return newest;
}

function boxRing([w, s, e, n]) {
  return [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ];
}

async function extract(binary, build, name, area, minzoom, maxzoom) {
  const file = path.join(out, `${name}-${build}.pmtiles`);
  const where = [];
  if (area.length === 4 && typeof area[0] === 'number') where.push(`--bbox=${area.join(',')}`);
  else {
    const region = path.join(CACHE, `${name}-region.geojson`);
    const geometry = { type: 'MultiPolygon', coordinates: area.map(boxRing) };
    await writeFile(region, JSON.stringify({ type: 'Feature', properties: {}, geometry }));
    where.push(`--region=${region}`);
  }
  console.log(`${file}: ${name}, z${minzoom} to z${maxzoom}`);
  const zooms = [`--minzoom=${minzoom}`, `--maxzoom=${maxzoom}`];
  execFileSync(binary, ['extract', BUILD_URL(build), file, ...where, ...zooms], {
    stdio: 'inherit',
  });
  console.log(`  ${((await stat(file)).size / 1e6).toFixed(1)} MB`);
}

async function assets() {
  const root = 'public/map/v1';
  const fonts = path.join(root, 'fonts', FONT);
  await mkdir(fonts, { recursive: true });
  await mkdir(path.join(root, 'sprites'), { recursive: true });
  const font = encodeURIComponent(FONT);
  for (const range of GLYPH_RANGES) {
    await download(`${ASSETS}/fonts/${font}/${range}.pbf`, path.join(fonts, `${range}.pbf`));
  }
  await download(`${ASSETS}/fonts/OFL.txt`, path.join(root, 'fonts', 'OFL.txt'));
  // Asked for ranges we do not keep (style.ts); an empty file is a font with no glyphs.
  await writeFile(path.join(root, 'fonts', 'empty.pbf'), '');
  for (const sprite of SPRITES) {
    for (const file of [
      `${sprite}.json`,
      `${sprite}.png`,
      `${sprite}@2x.json`,
      `${sprite}@2x.png`,
    ]) {
      await download(`${ASSETS}/sprites/v4/${file}`, path.join(root, 'sprites', file));
    }
  }
  await download(
    'https://raw.githubusercontent.com/tangrams/icons/master/LICENSE.md',
    path.join(root, 'sprites', 'LICENSE.md'),
  );
  console.log(`${root}: glyphs and sprites`);
}

async function uploadAll() {
  if (dev) throw new Error('--dev tiles cover only the Bay Area: never upload them.');
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.');
  }
  const build = BUILD_LINE.exec(await readFile(BUILD_FILE, 'utf8'))?.[1];
  for (const name of ['us', 'ca']) {
    const key = `${name}-${build}.pmtiles`;
    console.log(`${key}: uploading`);
    const result = await uploadFile({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: process.env.R2_BUCKET || 'sciclub-tiles',
      key,
      file: path.join(out, key),
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      log: console.log,
    });
    console.log(`${key}: ${result}`);
  }
  console.log(
    `\nThe tiles must be on R2 before the deploy that sets TILES_BUILD = '${build}':\n` +
      'a member whose app asks for a file not there yet sees no map.',
  );
}

if (assetsOnly) {
  await assets();
} else if (upload) {
  await uploadAll();
} else {
  const build = await chooseBuild();
  const binary = await pmtilesBinary();
  await mkdir(out, { recursive: true });
  await extract(binary, build, 'us', UNITED_STATES, 0, 7);
  // From z8: below that, us already has the same tiles (CA_MINZOOM in style.ts).
  await extract(binary, build, 'ca', dev ? BAY_AREA : CALIFORNIA, 8, dev ? 13 : 14);
}
