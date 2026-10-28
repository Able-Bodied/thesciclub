import type { MapLibreMap } from '@/lib/map';
import { type Badge, pixelRatio, put } from '@/routes/map/organization-badges';

/**
 * A city with one member shows their photograph in the peers' box, not "1"
 * (the owner, 2026-10-28). The same rounded box, navy-edged, as the count;
 * until the photograph arrives, and if it fails, the box says 1 as before.
 * Drawn once into pixels and kept, as organization-badges.ts does for logos.
 *
 * Only for a member who has a photograph and is counted on the map
 * (show_on_map). Tapping the box lists them by name, as it already did.
 */

/** MapLibre's image id for a member's photograph box. */
export const PHOTO_PREFIX = 'peer-photo-';
/** As the peers' box in map-layers.ts. */
const SIZE = 34;
const GOLD = '#d4a83a';
const NAVY = '#102a4c';
const HEAD = '"Atkinson Hyperlegible Next", "Segoe UI", system-ui, sans-serif';

export interface PhotoSource {
  photoPath: string;
  /** Signed URL of the small copy; null until signed, or refused. */
  url: string | null;
}

type Picture = CanvasImageSource & { width: number; height: number };

function box(pen: CanvasRenderingContext2D) {
  const [from, to, r] = [1.5, SIZE - 1.5, 8];
  pen.beginPath();
  pen.moveTo(from + r, from);
  pen.arcTo(to, from, to, to, r);
  pen.arcTo(to, to, from, to, r);
  pen.arcTo(from, to, from, from, r);
  pen.arcTo(from, from, to, from, r);
  pen.closePath();
}

/** The box with the photograph cropped to fill it, or with a 1. Paths, not roundRect (iOS 15). */
export function drawPhotoBox(look: { photo: Picture } | { one: true }): Badge | null {
  const ratio = pixelRatio();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(SIZE * ratio);
  canvas.height = canvas.width;
  const pen = canvas.getContext('2d');
  if (!pen) return null;
  pen.scale(ratio, ratio);
  box(pen);
  pen.fillStyle = GOLD;
  pen.fill();
  if ('photo' in look) {
    const { width, height } = look.photo;
    if (width > 0 && height > 0) {
      // Cover: the shorter side fills the box, the middle kept.
      const side = Math.min(width, height);
      pen.save();
      box(pen);
      pen.clip();
      pen.drawImage(
        look.photo,
        (width - side) / 2,
        (height - side) / 2,
        side,
        side,
        1.5,
        1.5,
        SIZE - 3,
        SIZE - 3,
      );
      pen.restore();
    }
  } else {
    pen.font = `800 14px ${HEAD}`;
    pen.fillStyle = NAVY;
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillText('1', SIZE / 2, SIZE / 2 + 0.5);
  }
  box(pen);
  pen.lineWidth = 2.5;
  pen.strokeStyle = NAVY;
  pen.stroke();
  return { data: pen.getImageData(0, 0, canvas.width, canvas.height), ratio };
}

let one: Badge | null | undefined;
/** By photograph path: the finished box, or null when it failed. */
const finished = new Map<string, Badge | null>();
const loading = new Map<string, Promise<Badge | null>>();
const sources = new WeakMap<MapLibreMap, Map<string, PhotoSource>>();
/** Which members' boxes each map was given, so only those follow a change. */
const drawn = new WeakMap<MapLibreMap, Set<string>>();

/** For tests. */
export function forgetPhotoBoxes(): void {
  one = undefined;
  finished.clear();
  loading.clear();
}

async function decode(url: string): Promise<Badge | null> {
  try {
    const response = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    const picture = await createImageBitmap(await response.blob());
    const badge = drawPhotoBox({ photo: picture });
    picture.close();
    return badge;
  } catch {
    // Offline, refused, or not a picture: the 1 stays.
    return null;
  }
}

function load(path: string, url: string): Promise<Badge | null> {
  let pending = loading.get(path);
  if (!pending) {
    pending = decode(url).then((badge) => {
      finished.set(path, badge);
      loading.delete(path);
      return badge;
    });
    loading.set(path, pending);
  }
  return pending;
}

function draw(map: MapLibreMap, memberId: string): void {
  const id = `${PHOTO_PREFIX}${memberId}`;
  const given = drawn.get(map) ?? new Set<string>();
  drawn.set(map, given);
  given.add(memberId);
  const source = sources.get(map)?.get(memberId);
  const done = source ? finished.get(source.photoPath) : undefined;
  if (done) {
    put(map, id, done);
    return;
  }
  if (one === undefined) one = drawPhotoBox({ one: true });
  put(map, id, one);
  if (!source?.url || finished.has(source.photoPath)) return;
  const path = source.photoPath;
  void load(path, source.url).then((badge) => {
    if (badge && sources.get(map)?.get(memberId)?.photoPath === path) put(map, id, badge);
  });
}

export const isPhotoBox = (id: string) => id.startsWith(PHOTO_PREFIX);

/** For MapLibre's missing-image resolver: a box the map is about to draw. */
export function addPhotoBox(map: MapLibreMap, id: string): void {
  if (isPhotoBox(id)) draw(map, id.slice(PHOTO_PREFIX.length));
}

/** Each lone member's photograph; a box already drawn follows a change. */
export function setPhotoBoxes(map: MapLibreMap, next: Map<string, PhotoSource>): void {
  const before = sources.get(map);
  sources.set(map, next);
  for (const memberId of drawn.get(map) ?? []) {
    const old = before?.get(memberId);
    const now = next.get(memberId);
    if (now && (old?.photoPath !== now.photoPath || old.url !== now.url)) draw(map, memberId);
  }
}
